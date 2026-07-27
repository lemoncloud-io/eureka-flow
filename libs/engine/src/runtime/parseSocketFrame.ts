import { isNodeState } from '../types';

import type { NodeEvent, PortEvent, ProgressEvent } from './executionReducer';
import type { NodeState } from '../types';

/**
 * A trace line from an agent block's run.
 *
 * The engine does not interpret traces — it only recognises them, so a caller that wants
 * to show a log has one parser to go through instead of two.
 */
export interface TraceFrameData {
    nodeId: string;
    flowId?: string;
    seq: number;
    ts: number;
    stage?: string;
    message?: string;
    state?: string;
    runId?: string;
    data?: Record<string, unknown>;
}

/** One line inside a `log:*` batch — output, not a state change. */
export interface LogFrameEntry {
    level?: string;
    message?: string;
    ts?: number;
    seq?: number;
    json?: Record<string, unknown>;
}

export interface LogFrameData {
    nodeId: string;
    /** Which reporter produced the batch; server-side this is per-invocation. */
    source?: string;
    /** Logs arrive batched, and the batch order is the order they were written in. */
    entries: LogFrameEntry[];
}

/**
 * One frame off the socket, told apart.
 *
 * `node` and `port` and `progress` carry exactly what the reducer takes, so nothing sits
 * between the two: a translation layer here would be a second place for the ordering
 * fields to go missing.
 */
export type SocketFrame =
    /** `ts` rides alongside: the reducer orders by sequence, never by wall clock. */
    | { kind: 'node'; event: NodeEvent; ts?: number }
    /** `direction` rides alongside rather than inside: the reducer never reads it, and the
     *  follow-up fetch that does is the caller's. */
    | { kind: 'port'; event: PortEvent; direction?: 'in' | 'out' }
    /** The trailing fields are the caller's — a label to show, a product view to merge. */
    | {
          kind: 'progress';
          event: ProgressEvent;
          label?: string;
          error?: string;
          ts?: number;
          product$?: Record<string, unknown>;
      }
    | { kind: 'flow'; flowId: string }
    | { kind: 'trace'; trace: TraceFrameData }
    | { kind: 'log'; log: LogFrameData };

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
const num = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined);

/**
 * Strip the envelope the socket service wraps frames in.
 *
 * `action: 'trace'` is the awkward one: its `seq`/`ts`/`stage` sit at the top level while
 * the node id sits inside `data`, so neither half is a usable frame alone.
 */
export const unwrapSocketEnvelope = (
    msg: Record<string, unknown>
): { payload: Record<string, unknown>; action?: string } => {
    const action = str(msg['action']);
    const data = msg['data'];

    if (action === 'trace' && isRecord(data)) {
        const { action: _action, data: _data, ...top } = msg;
        return { payload: { ...top, ...data }, action };
    }
    if (action === 'message' && isRecord(data)) return { payload: data, action };
    return { payload: msg, action };
};

/**
 * Split a port id into its parts.
 *
 * Format is `nodeId:portName@direction`, e.g. `1000637:in@in`. The `@direction` suffix is
 * optional — without it the direction is the server's to decide, and guessing here would
 * send the follow-up fetch to the wrong side of the node.
 */
export const parsePortId = (
    fullId: string
): { nodeId: string; portId: string; portName: string; direction?: 'in' | 'out' } | null => {
    const at = fullId.indexOf('@');
    const portId = at === -1 ? fullId : fullId.slice(0, at);
    const suffix = at === -1 ? undefined : fullId.slice(at + 1);
    const direction = suffix === 'in' || suffix === 'out' ? suffix : undefined;

    const colon = portId.indexOf(':');
    if (colon === -1) return null;

    return { nodeId: portId.slice(0, colon), portId, portName: portId.slice(colon + 1), direction };
};

/**
 * A `progress:*` snapshot, whose fields sit one level down.
 *
 * These are lemon-model envelopes: `{ type, id, data: { status, percent, seq, ... } }`.
 * Reading the top level instead would find a `seq` that belongs to the envelope, not the
 * snapshot, and order the stream by the wrong clock.
 */
const parseProgress = (payload: Record<string, unknown>, id: string): SocketFrame | null => {
    const inner = payload['data'];
    if (!isRecord(inner)) return null;

    const meta = inner['meta'];
    const product$ = isRecord(meta) && isRecord(meta['product$']) ? meta['product$'] : undefined;

    return {
        kind: 'progress',
        label: str(inner['label']),
        error: str(inner['error']),
        ts: num(inner['ts']),
        product$,
        event: {
            nodeId: id,
            seq: num(inner['seq']) ?? 0,
            status: str(inner['status']),
            percent: num(inner['percent']),
            step: num(inner['step']),
            totalSteps: num(inner['totalSteps']),
        },
    };
};

const parseNode = (payload: Record<string, unknown>, id: string): SocketFrame | null => {
    // `nodeId@2` names a history snapshot, not the live node. Applying one would show a
    // past run's state on a node that has moved on.
    if (id.includes('@')) return null;

    // A node id with a colon in it is a port's id — the frame is really about the parent.
    const colon = id.indexOf(':');
    const isPort = colon !== -1;

    return {
        kind: 'node',
        ts: num(payload['ts']),
        event: {
            nodeId: id,
            flowId: str(payload['flowId']),
            runId: str(payload['runId']),
            no: num(payload['no']),
            state: isNodeState(str(payload['state']) ?? '') ? (payload['state'] as NodeState) : undefined,
            stage: str(payload['stage']),
            progress: num(payload['progress']),
            error: str(payload['error']),
            isPort,
            parentNodeId: isPort ? id.slice(0, colon) : undefined,
        },
    };
};

/**
 * Read one raw frame.
 *
 * Returns `null` for anything unrecognised rather than throwing: the socket carries
 * traffic this engine has no opinion about, and a stray frame is not an error.
 */
export const parseSocketFrame = (raw: unknown): SocketFrame | null => {
    const parsed = typeof raw === 'string' ? safeJson(raw) : raw;
    if (!isRecord(parsed)) return null;

    const { payload } = unwrapSocketEnvelope(parsed);
    const id = str(payload['id']) ?? str(payload['nodeId']);
    if (!id) return null;

    const type = str(payload['type']);

    if (type?.startsWith('progress:')) return parseProgress(payload, id);

    if (type?.startsWith('log:')) {
        const batch = payload['data'];
        if (!isRecord(batch)) return null;
        const entries = batch['entries'];
        if (!Array.isArray(entries) || entries.length === 0) return null;

        return {
            kind: 'log',
            log: {
                nodeId: id,
                source: str(batch['source']),
                entries: entries.filter(isRecord).map(entry => {
                    const json = entry['json'];
                    return {
                        level: str(entry['level']),
                        message: str(entry['message']),
                        ts: num(entry['ts']),
                        seq: num(entry['seq']),
                        json: isRecord(json) ? json : undefined,
                    };
                }),
            },
        };
    }

    // Traces are checked before node frames, not after. A merged trace payload carries the
    // `type: 'node'` of the data it was merged with, so matching on type first would file
    // every agent trace as a node state change. `seq` is the discriminant: node frames
    // sequence themselves with `no`, and only traces carry `seq`.
    const seq = num(payload['seq']);
    if (seq !== undefined) {
        const stage = str(payload['stage']);
        const message = str(payload['message']);
        // Neither a stage nor a message: a completion signal with nothing to show.
        if (stage === undefined && message === undefined) return null;

        const data = payload['data'];
        return {
            kind: 'trace',
            trace: {
                nodeId: id,
                flowId: str(payload['flowId']),
                seq,
                ts: num(payload['ts']) ?? 0,
                stage,
                message,
                state: str(payload['state']),
                runId: str(payload['runId']),
                data: isRecord(data) ? data : undefined,
            },
        };
    }

    if (type === 'flow') return { kind: 'flow', flowId: id };

    if (type === 'node/port') {
        const parts = parsePortId(id);
        if (!parts) return null;
        return {
            kind: 'port',
            direction: parts.direction,
            event: {
                portId: parts.portId,
                nodeId: parts.nodeId,
                portName: parts.portName,
                flowId: str(payload['flowId']),
                runId: str(payload['runId']),
                no: num(payload['no']),
                ts: num(payload['ts']),
            },
        };
    }

    if (type === 'node') return parseNode(payload, id);

    return null;
};

const safeJson = (text: string): unknown => {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
};
