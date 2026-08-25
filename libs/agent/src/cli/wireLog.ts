import { appendFileSync, writeFileSync } from 'node:fs';

import { errorMessage } from '../utils/errors';

import type { CanvasBinding, NodePatch } from '../canvas';
import type { ChatRequest, Chunk, LlmGateway } from '../llm/llmGateway';
import type { SessionState } from '../session/session';
import type { HttpPort, HttpRequest } from '@flows/engine';

/**
 * A wire log for confirming and reading back what the terminal did — the chat transcript, the canvas edits,
 * per-call model token usage, and the flow-API HTTP, all in one timeline. The gateway / binding / HTTP wraps
 * are transparent decorators (results pass through unchanged); the chat channel is fed the session state on
 * each change. The file is truncated on creation.
 */
export interface WireLog {
    /** Wrap the model gateway: one token-accounting line per call. */
    gateway(inner: LlmGateway): LlmGateway;
    /** Wrap the canvas binding: log each add/update/delete of a node or edge with its result. */
    binding(inner: CanvasBinding): CanvasBinding;
    /** Wrap the flow-API port: log method + path + status + a response-body preview. */
    httpPort(inner: HttpPort): HttpPort;
    /** Append the transcript messages not yet logged, as chat turns. Call on every session change. */
    chat(state: SessionState): void;
    /** Append a free-form marker (session start/end, save outcome). */
    note(message: string): void;
    /** The file being written. */
    readonly path: string;
}

const stamp = (): string => new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm — the date is on the header line

const asText = (value: unknown): string => {
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value) ?? String(value);
    } catch {
        return String(value);
    }
};

const preview = (value: unknown, max = 240): string => {
    const text = asText(value).replace(/\s+/g, ' ').trim();
    return text.length <= max ? text : `${text.slice(0, max)}…(+${text.length - max})`;
};

/** Short id for readability; the full id is in the graph JSON when precise correlation is needed. */
const sid = (id: string): string => (id.length > 12 ? `${id.slice(0, 12)}…` : id);

/** Which agent is calling, inferred from its toolset — the orchestrator alone has `spawn`; editors have `add_node`. */
const roleOf = (req: ChatRequest): string =>
    req.tools.some(t => t.name === 'spawn')
        ? 'orchestrator'
        : req.tools.some(t => t.name === 'add_node')
          ? 'builder'
          : 'agent';

const patchDesc = (patch: NodePatch): string => {
    if (patch.label !== undefined) return `rename "${patch.label}"`;
    if (patch.position) return `move (${patch.position.x},${patch.position.y})`;
    if (patch.config) return `config ${preview(patch.config, 160)}`;
    return 'update';
};

export const createWireLog = (path: string): WireLog => {
    writeFileSync(
        path,
        `# agent:terminal wire log — cleared ${new Date().toISOString()}\n# every run overwrites this file\n`
    );
    const append = (line: string): void => appendFileSync(path, `${line}\n`);

    let modelSeq = 0;
    let httpSeq = 0;
    let logged = 0; // transcript messages already written (chat channel)
    const toolNames = new Map<string, string>(); // tool-call id → name, so a result line can name its tool

    const gateway = (inner: LlmGateway): LlmGateway => ({
        capabilities: inner.capabilities,
        chat: (req, opts) => {
            const n = (modelSeq += 1);
            const role = roleOf(req);
            return (async function* () {
                let usage: Chunk['usage'];
                try {
                    for await (const chunk of inner.chat(req, opts)) {
                        if (chunk.usage) usage = chunk.usage;
                        yield chunk;
                    }
                    const u = usage
                        ? `in=${usage.inputTokens ?? '?'} out=${usage.outputTokens ?? '?'} total=${usage.providerTotalTokens ?? '?'} cached=${usage.cachedInputTokens ?? 0}`
                        : 'no backend call (fake gateway)';
                    append(`${stamp()} ⟐ #${n} ${role} · ${u}`);
                } catch (err) {
                    append(`${stamp()} ✗ #${n} ${role} error: ${errorMessage(err)}`);
                    throw err;
                }
            })();
        },
    });

    const chat = (state: SessionState): void => {
        const messages = state.messages;
        if (messages.length < logged) logged = 0; // a new session (reset) — start over
        for (let i = logged; i < messages.length; i += 1) {
            const m = messages[i];
            if (m.role === 'user') {
                append(`\n${stamp()} » user: ${preview(m.content ?? '', 500)}`);
            } else if (m.role === 'assistant') {
                if (m.content) append(`${stamp()} assistant: ${preview(m.content, 1000)}`);
                else if (m.toolCalls?.length) append(`${stamp()} assistant:`);
                for (const tc of m.toolCalls ?? []) {
                    toolNames.set(tc.id, tc.name);
                    append(`  ⚙ ${tc.name} ${preview(tc.args, 300)}`);
                }
            } else if (m.role === 'tool') {
                const name = m.toolCallId ? toolNames.get(m.toolCallId) : undefined;
                append(`  ↳ ${name ? `${name} → ` : ''}${preview(m.content ?? '', 300)}`);
            }
        }
        logged = messages.length;
    };

    /** Run a canvas op, logging its result line on success or a `✗ … rejected` line (then rethrow) on failure. */
    const loggedOp = <T>(run: () => T, describe: (result: T) => string, label: string): T => {
        try {
            const result = run();
            append(`${stamp()} ${describe(result)}`);
            return result;
        } catch (err) {
            append(`${stamp()} ✗ ${label} rejected: ${errorMessage(err)}`);
            throw err;
        }
    };

    const binding = (inner: CanvasBinding): CanvasBinding => ({
        readGraph: () => inner.readGraph(), // hot path (every repaint) — deliberately not logged
        addNode: (type, position) =>
            loggedOp(
                () => inner.addNode(type, position),
                r => `+ node ${type} ${sid(r.id)} @(${position.x},${position.y})`,
                `node ${type}`
            ),
        addEdge: spec =>
            loggedOp(
                () => inner.addEdge(spec),
                r =>
                    `+ edge ${sid(spec.sourceNodeId)}:${spec.sourcePortId} → ${sid(spec.targetNodeId)}:${spec.targetPortId} ${sid(r.id)}`,
                'edge'
            ),
        updateNode: (id, patch) =>
            loggedOp(
                () => inner.updateNode(id, patch),
                () => `~ node ${sid(id)} ${patchDesc(patch)}`,
                `node ${sid(id)}`
            ),
        deleteNode: id =>
            loggedOp(
                () => inner.deleteNode(id),
                () => `- node ${sid(id)}`,
                `node ${sid(id)}`
            ),
        deleteEdge: id =>
            loggedOp(
                () => inner.deleteEdge(id),
                () => `- edge ${sid(id)}`,
                `edge ${sid(id)}`
            ),
    });

    const httpPort = (inner: HttpPort): HttpPort => ({
        request: async <T>(req: HttpRequest) => {
            const n = (httpSeq += 1);
            append(`${stamp()} → HTTP #${n} ${req.method} ${req.path}`);
            try {
                const res = await inner.request<T>(req);
                append(
                    `${stamp()} ← HTTP #${n} ${res.status} ${req.method} ${req.path}  data: ${preview(res.data, 300)}`
                );
                return res;
            } catch (err) {
                append(`${stamp()} ✗ HTTP #${n} ${req.method} ${req.path} error: ${errorMessage(err)}`);
                throw err;
            }
        },
    });

    return {
        gateway,
        binding,
        httpPort,
        chat,
        note: message => append(`${stamp()} · ${message}`),
        path,
    };
};
