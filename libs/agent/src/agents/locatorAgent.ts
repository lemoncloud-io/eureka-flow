import { createCanvasToolProvider, listNodeLocations } from '../canvas/canvasTools';
import { DEFAULT_STEP } from '../canvas/moveSemantics';
import { createToolExecutor } from '../tools/toolExecutor';

import type { Agent, AgentConfig } from '../agent';
import type { CanvasBinding } from '../canvas/canvasBinding';
import type { ChatMessage, Chunk, LlmGateway } from '../llm/llmGateway';
import type { Message, Storage } from '../session/session';
import type { ToolCall, ToolExecutor, ToolResult } from '../tools/toolTypes';

/** The locator agent's persona. */
export const LOCATOR_SYSTEM_PROMPT = [
    'You are the Locator agent for a visual flow editor. Your ONLY job is to relocate existing nodes on the canvas.',
    '',
    'Rules:',
    '- You can ONLY move existing nodes (change their position). You cannot add, delete, rename, connect, or reconfigure nodes.',
    '  If the user asks for anything other than moving a node, briefly say you can only move nodes.',
    '- To move a node, call `move_node` with the node id and EXACTLY ONE of `by` (relative delta) or `to` (absolute point).',
    '- Coordinates: origin is top-left; x increases to the right, y increases downward.',
    '  So right = +dx, left = -dx, up = -dy, down = +dy. Diagonals combine both axes.',
    `- If the user gives no distance (e.g. "nudge it right", "move it up a bit"), use a default of ${DEFAULT_STEP}px and say so.`,
    '- Match the node the user means by its label or type against the provided node list (case-insensitive).',
    '  If NO node matches, do not move anything — say you could not find it (you may list the nodes you can see).',
    '  If MORE THAN ONE node matches, do not guess — ask which one, listing the candidates.',
    '- Move exactly one node per `move_node` call; for several nodes, make several calls.',
    '- After moving, confirm briefly what you moved and its new position.',
].join('\n');

const DEFAULT_MAX_ITERATIONS = 8;

export interface LocatorAgentDeps {
    gateway: LlmGateway;
    binding: CanvasBinding;
    storage: Storage;
    flowId: string;
    /** Defaults to a fresh {@link createToolExecutor}. */
    executor?: ToolExecutor;
    /** Override the agent config (id/description/systemPrompt/grant). Tools are always the locator provider. */
    config?: Partial<Omit<AgentConfig, 'tools'>>;
    /** Safety cap on think/act iterations per turn. */
    maxIterations?: number;
}

interface CollectedResponse {
    text: string;
    toolCalls: { id: string; name: string; args: unknown; rawArgs: string }[];
}

const safeJsonParse = (raw: string): unknown => {
    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
};

/** Drain a chat stream into accumulated text + parsed tool calls. */
const collect = async (stream: AsyncIterable<Chunk>): Promise<CollectedResponse> => {
    let text = '';
    const order: string[] = [];
    const acc = new Map<string, { name: string; rawArgs: string }>();

    for await (const chunk of stream) {
        if (chunk.text) {
            text += chunk.text;
        }
        if (chunk.toolCall) {
            const { id, name, argsDelta } = chunk.toolCall;
            const existing = acc.get(id);
            if (existing) {
                existing.rawArgs += argsDelta;
            } else {
                order.push(id);
                acc.set(id, { name, rawArgs: argsDelta });
            }
        }
    }

    return {
        text,
        toolCalls: order.map(id => {
            const { name, rawArgs } = acc.get(id) as { name: string; rawArgs: string };
            return { id, name, args: safeJsonParse(rawArgs), rawArgs };
        }),
    };
};

const renderNodeContext = (binding: CanvasBinding): string => {
    const nodes = listNodeLocations(binding);
    if (nodes.length === 0) {
        return 'Current canvas: (no nodes).';
    }
    const lines = nodes.map(
        n =>
            `- id="${n.id}" type="${n.type}"${n.label ? ` label="${n.label}"` : ''} at (${n.position.x}, ${n.position.y})`
    );
    return `Current nodes on the canvas:\n${lines.join('\n')}`;
};

/** Map the persisted transcript into the provider-neutral message list. */
const toChatMessages = (systemPrompt: string, nodeContext: string, messages: Message[]): ChatMessage[] => {
    const chat: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'system', content: nodeContext },
    ];
    for (const msg of messages) {
        if (msg.role === 'tool') {
            chat.push({ role: 'tool', content: msg.content ?? '', toolCallId: msg.toolCallId });
        } else if (msg.role === 'assistant' && msg.toolCalls?.length) {
            chat.push({
                role: 'assistant',
                content: msg.content ?? null,
                toolCalls: msg.toolCalls.map(tc => ({ id: tc.id, name: tc.name, args: tc.args })),
            });
        } else {
            chat.push({ role: msg.role, content: msg.content ?? null });
        }
    }
    return chat;
};

const resultToContent = (result: ToolResult): string =>
    result.ok ? JSON.stringify(result.data ?? { ok: true }) : JSON.stringify({ error: result.error });

/**
 * Create the locator {@link Agent}. `send(text)` runs the whole think/act turn: it asks
 * the model (seeded with the current node list), applies each `move_node` straight to the
 * live canvas via the {@link CanvasBinding}, and ends on the model's confirmation text.
 * There is no draft and no approval gate (spec 0002 §2.2).
 */
export const createLocatorAgent = (deps: LocatorAgentDeps): Agent => {
    const { gateway, binding, storage, flowId } = deps;
    const executor = deps.executor ?? createToolExecutor();
    const maxIterations = deps.maxIterations ?? DEFAULT_MAX_ITERATIONS;

    const config: AgentConfig = {
        id: deps.config?.id ?? 'locator',
        description: deps.config?.description ?? 'Moves existing nodes on the canvas.',
        systemPrompt: deps.config?.systemPrompt ?? LOCATOR_SYSTEM_PROMPT,
        grant: deps.config?.grant ?? { canModifyCanvas: true },
        tools: [createCanvasToolProvider(binding)],
    };

    let seq = 0;
    const nextId = (prefix: string) => `${prefix}-${flowId}-${(seq += 1)}`;
    const stamp = (): number => Date.now();

    let controller: AbortController | null = null;

    const send = async (text: string): Promise<void> => {
        const existing = storage.load(flowId);
        if (existing?.phase === 'thinking') {
            // A turn is already in flight; ignore concurrent sends. The turn model is
            // single-active (spec §6.1); the Panel disables input while thinking.
            return;
        }
        const state = existing ?? storage.create(flowId);
        // Seed the id counter past any persisted transcript so ids stay unique after a
        // reload (a fresh agent instance restarts `seq` at 0).
        seq = Math.max(seq, state.messages.length);
        controller = new AbortController();
        const { signal } = controller;

        state.messages.push({ id: nextId('u'), role: 'user', content: text, ts: stamp() });
        state.phase = 'thinking';
        state.error = undefined;
        storage.save(state);

        try {
            for (let i = 0; i < maxIterations; i += 1) {
                if (signal.aborted) {
                    state.phase = 'done';
                    storage.save(state);
                    return;
                }

                const chatMessages = toChatMessages(config.systemPrompt, renderNodeContext(binding), state.messages);
                const tools = await executor.listTools(config);
                const res = await collect(gateway.chat({ messages: chatMessages, tools, stream: true }, { signal }));

                // The response finished draining; if the turn was aborted meanwhile, stop
                // before applying any of its moves (already-applied moves stay applied, §6.1).
                if (signal.aborted) {
                    state.phase = 'done';
                    storage.save(state);
                    return;
                }

                if (res.toolCalls.length > 0) {
                    const assistantMsg: Message = {
                        id: nextId('a'),
                        role: 'assistant',
                        content: res.text || undefined,
                        toolCalls: res.toolCalls.map(tc => ({
                            id: tc.id,
                            name: tc.name,
                            args: tc.rawArgs,
                            status: 'ok',
                        })),
                        ts: stamp(),
                    };
                    state.messages.push(assistantMsg);
                    storage.save(state);

                    for (const tc of res.toolCalls) {
                        const call: ToolCall = { id: tc.id, name: tc.name, args: tc.args };
                        const result = await executor.dispatch(config, call);
                        // Patch the assistant message by stable reference — the array's last
                        // element is a tool message on the 2nd+ iteration.
                        const recorded = assistantMsg.toolCalls?.find(c => c.id === tc.id);
                        if (recorded) {
                            recorded.status = result.ok ? 'ok' : 'error';
                        }
                        state.messages.push({
                            id: nextId('t'),
                            role: 'tool',
                            content: resultToContent(result),
                            toolCallId: tc.id,
                            ts: stamp(),
                        });
                        storage.save(state);
                    }
                    continue;
                }

                // Final text only — the turn is complete.
                if (res.text) {
                    state.messages.push({ id: nextId('a'), role: 'assistant', content: res.text, ts: stamp() });
                }
                state.phase = 'done';
                storage.save(state);
                return;
            }

            state.phase = 'error';
            state.error = `locator: exceeded ${maxIterations} reasoning iterations without finishing`;
            storage.save(state);
        } catch (err) {
            if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
                state.phase = 'done';
                storage.save(state);
                return;
            }
            state.phase = 'error';
            state.error = err instanceof Error ? err.message : String(err);
            storage.save(state);
        }
    };

    const abort = (): void => {
        controller?.abort();
    };

    return { send, abort };
};
