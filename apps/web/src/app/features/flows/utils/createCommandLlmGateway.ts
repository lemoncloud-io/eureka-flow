import { DEFAULT_STEP, directionToDelta } from '@flows/agent';

import type { ChatMessage, ChatRequest, Chunk, Direction, LlmGateway } from '@flows/agent';

/**
 * Offline command gateway (DEV) — no network, no API key. It receives the **exact same
 * request a real LLM would** (system prompt + live node list + transcript + tool defs), parses
 * a structured command out of the latest user message, and emits the matching tool call — so
 * the whole agent → ToolExecutor → CanvasBinding pipeline runs for real and actually moves the
 * node. Everything it "sees" and "decides" is logged to the console, so you can confirm the
 * wiring is correct before swapping in a real (backend-proxied) gateway.
 *
 * Type these into the panel:
 *   move(<node>, <direction>, <distance?>)   e.g. move(Fetch, up, 10)        — relative; distance defaults to DEFAULT_STEP
 *   move(<node>, to, <x>, <y>)               e.g. move(Email, to, 100, 200)  — absolute
 *   list                                     — list the nodes it can see
 *
 * <node> matches a node's label / type / id (case-insensitive), mirroring the system prompt's
 * resolution rules. Unmatched / ambiguous targets reply with text, exactly like a real turn.
 */

const DIRECTIONS: Direction[] = ['right', 'left', 'up', 'down', 'up-right', 'up-left', 'down-right', 'down-left'];

interface SeenNode {
    id: string;
    type: string;
    label?: string;
    x: number;
    y: number;
}

interface ParsedCommand {
    verb: 'move' | 'list' | 'unknown';
    target?: string;
    mode?: 'by' | 'to';
    direction?: string;
    distance?: number;
    x?: number;
    y?: number;
}

/** Pull the node list out of the "Current nodes…" system message the agent injects each turn. */
const parseNodeContext = (messages: ChatMessage[]): SeenNode[] => {
    const ctx = messages.find(m => m.role === 'system' && (m.content ?? '').startsWith('Current nodes'));
    if (!ctx?.content) {
        return [];
    }
    const re = /- id="([^"]+)" type="([^"]+)"(?: label="([^"]+)")? at \(([-\d.]+), ([-\d.]+)\)/g;
    const out: SeenNode[] = [];
    for (const m of ctx.content.matchAll(re)) {
        out.push({ id: m[1], type: m[2], label: m[3], x: Number(m[4]), y: Number(m[5]) });
    }
    return out;
};

/**
 * Resolve a target to node(s) by an **exact** (case-insensitive) match on label / type / id.
 * Exact only, on purpose: a substring fallback fuzzy-matches a non-existent target onto a real
 * node (e.g. "Beta" onto "Betamax"), silently moving the wrong node instead of reporting that
 * the target doesn't exist. A deterministic test harness should never guess.
 */
const resolveNode = (nodes: SeenNode[], target: string): SeenNode[] => {
    const t = target.trim().toLowerCase();
    return nodes.filter(n => [n.label, n.type, n.id].some(v => v?.toLowerCase() === t));
};

const parseCommand = (text: string): ParsedCommand => {
    const raw = text.trim();
    if (/^list\b/i.test(raw)) {
        return { verb: 'list' };
    }
    const m = raw.match(/^move\s*\(([^)]*)\)/i) ?? raw.match(/^move\s+(.+)$/i);
    if (!m) {
        return { verb: 'unknown' };
    }
    const [target, second, third, fourth] = m[1]
        .split(/[,\s]+/)
        .map(s => s.trim())
        .filter(Boolean);
    if (!target) {
        return { verb: 'unknown' };
    }
    if (second?.toLowerCase() === 'to') {
        return { verb: 'move', mode: 'to', target, x: Number(third), y: Number(fourth) };
    }
    return {
        verb: 'move',
        mode: 'by',
        target,
        direction: second?.toLowerCase(),
        distance: third !== undefined ? Number(third) : DEFAULT_STEP,
    };
};

/** Render a spoken confirmation from a tool result (the JSON the executor returned). */
const describeToolResult = (content: string | null): string => {
    try {
        const data = JSON.parse(content ?? '{}');
        if (data.error) {
            return `That didn't work: ${data.error}`;
        }
        if (Array.isArray(data.nodes)) {
            return data.nodes.length > 0
                ? `I can see ${data.nodes.length} node(s):\n` +
                      data.nodes
                          .map((n: SeenNode & { position?: { x: number; y: number } }) => {
                              const pos = n.position ?? { x: n.x, y: n.y };
                              return `• ${n.label ?? n.type} (${n.id}) at (${pos.x}, ${pos.y})`;
                          })
                          .join('\n')
                : 'There are no nodes on the canvas.';
        }
        if (data.to) {
            return `Moved ${data.label ?? data.nodeId} to (${data.to.x}, ${data.to.y}).`;
        }
        return 'Done.';
    } catch {
        return 'Done.';
    }
};

const logRequest = (req: ChatRequest): void => {
    console.groupCollapsed('[command-llm] ↙ request a real LLM would receive');
    for (const m of req.messages) {
        console.log(`[${m.role}]`, m.toolCalls ? { content: m.content, toolCalls: m.toolCalls } : m.content);
    }
    console.log(
        'tools:',
        req.tools.map(t => `${t.name}(${Object.keys(t.parameters.properties ?? {}).join(', ')})`)
    );
    console.groupEnd();
};

export const createCommandLlmGateway = (): LlmGateway => {
    let idCounter = 0;
    const nextId = () => `fake-call-${(idCounter += 1)}`;

    async function* chat(req: ChatRequest, opts?: { signal?: AbortSignal }): AsyncIterable<Chunk> {
        logRequest(req);
        if (opts?.signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }

        const last = req.messages[req.messages.length - 1];

        // Second half of a turn: a tool result came back — "speak" the confirmation.
        if (last?.role === 'tool') {
            const text = describeToolResult(last.content);
            console.log('[command-llm] ↗ tool result in → replying:', text);
            yield { text };
            yield { done: true };
            return;
        }

        // First half: parse the latest user command and emit a tool call (or a text reply).
        const userMsg = [...req.messages].reverse().find(m => m.role === 'user');
        const cmd = parseCommand(userMsg?.content ?? '');
        console.log('[command-llm] parsed command:', cmd);

        if (cmd.verb === 'list') {
            console.log('[command-llm] → tool call list_nodes {}');
            yield { toolCall: { id: nextId(), name: 'list_nodes', argsDelta: '{}' } };
            yield { done: true };
            return;
        }

        if (cmd.verb === 'unknown' || !cmd.target) {
            yield {
                text: 'I could not parse that. Try: move(Fetch, up, 10) · move(Email, to, 100, 200) · list',
            };
            yield { done: true };
            return;
        }

        const nodes = parseNodeContext(req.messages);
        const matches = resolveNode(nodes, cmd.target);
        if (matches.length === 0) {
            const seen = nodes.map(n => n.label ?? n.type).join(', ') || '(none)';
            yield { text: `I couldn't find a node matching "${cmd.target}". I can see: ${seen}.` };
            yield { done: true };
            return;
        }
        if (matches.length > 1) {
            const candidates = matches.map(n => `${n.label ?? n.type} (${n.id})`).join(', ');
            yield { text: `More than one node matches "${cmd.target}": ${candidates}. Which one?` };
            yield { done: true };
            return;
        }
        const node = matches[0];

        let args: Record<string, unknown>;
        if (cmd.mode === 'to') {
            const x = cmd.x ?? NaN;
            const y = cmd.y ?? NaN;
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                yield { text: 'For an absolute move use move(<node>, to, <x>, <y>) with numbers.' };
                yield { done: true };
                return;
            }
            args = { nodeId: node.id, to: { x, y } };
        } else {
            if (!cmd.direction || !DIRECTIONS.includes(cmd.direction as Direction)) {
                yield { text: `Unknown direction "${cmd.direction}". Use one of: ${DIRECTIONS.join(', ')}.` };
                yield { done: true };
                return;
            }
            args = { nodeId: node.id, by: directionToDelta(cmd.direction as Direction, cmd.distance) };
        }

        console.log('[command-llm] → tool call move_node', args, '(a real LLM would emit this from the prompt above)');
        yield { toolCall: { id: nextId(), name: 'move_node', argsDelta: JSON.stringify(args) } };
        yield { done: true };
    }

    return { chat };
};
