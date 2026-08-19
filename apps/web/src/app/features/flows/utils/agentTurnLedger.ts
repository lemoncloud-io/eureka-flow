import type { Message, SessionState } from '@flows/agent';

/**
 * Turns the raw agent transcript into what the panel renders. The session records every tool call
 * the orchestrator makes, but only some of them changed the user's flow: reads (`list_nodes`,
 * `get_graph`, …) answer the model's own questions and are dropped here, while writes and
 * delegations are the work the user asked for and become ledger rows.
 *
 * Kept separate from the view so the "what happened" rules are testable without rendering.
 */

/** A write is settled once its tool-result message lands; until then the turn is still doing it. */
export type LedgerOpStatus = 'running' | 'ok' | 'error';

/** The user-facing verb for a tool call. One per write tool, plus `spawn` → `delegate`. */
export type LedgerOpKind = 'add' | 'delete' | 'connect' | 'disconnect' | 'move' | 'rename' | 'configure' | 'delegate';

export interface LedgerOp {
    id: string;
    kind: LedgerOpKind;
    status: LedgerOpStatus;
    /** What was acted on, named the way the canvas names it: a block type, a node id, a specialist. */
    subject?: string;
    /** The second party, when the verb needs one: connect's target, rename's new label. */
    object?: string;
}

/** One entry in the rendered transcript: a chat message, or the work done between two of them. */
export type TranscriptItem =
    | { kind: 'message'; id: string; message: Message }
    | { kind: 'ledger'; id: string; ops: LedgerOp[] };

/** Tool → verb. A tool absent from this map is a read: it answered the model, not the user. */
const WRITE_KINDS: Record<string, LedgerOpKind> = {
    add_node: 'add',
    delete_node: 'delete',
    connect_nodes: 'connect',
    disconnect_edge: 'disconnect',
    move_node: 'move',
    rename: 'rename',
    set_properties: 'configure',
};

const parseArgs = (raw: string): Record<string, unknown> => {
    try {
        const parsed: unknown = JSON.parse(raw);
        return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
        return {};
    }
};

const str = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);

/** The `{subject, object}` each verb reads off its own arguments. */
const partsFor = (kind: LedgerOpKind, args: Record<string, unknown>): Pick<LedgerOp, 'subject' | 'object'> => {
    switch (kind) {
        case 'add':
            return { subject: str(args['type']) };
        case 'connect':
            return { subject: str(args['sourceNodeId']), object: str(args['targetNodeId']) };
        case 'disconnect':
            return { subject: str(args['edgeId']) };
        case 'rename':
            return { subject: str(args['nodeId']), object: str(args['label']) };
        default:
            return { subject: str(args['nodeId']) };
    }
};

/** `spawn` carries one entry per delegated task; each becomes its own row so a fan-out reads as one. */
const spawnOps = (callId: string, args: Record<string, unknown>, status: LedgerOpStatus): LedgerOp[] => {
    const children = Array.isArray(args['children']) ? args['children'] : [];
    if (children.length === 0) {
        return [{ id: callId, kind: 'delegate', status }];
    }
    return children.map((child, index) => ({
        id: `${callId}:${index}`,
        kind: 'delegate' as const,
        status,
        ...(str((child as Record<string, unknown>)?.['agentType'])
            ? { subject: str((child as Record<string, unknown>)['agentType']) }
            : {}),
    }));
};

const statusOf = (recorded: 'ok' | 'error', settled: boolean, running: boolean): LedgerOpStatus => {
    if (recorded === 'error') {
        return 'error';
    }
    if (settled) {
        return 'ok';
    }
    // Unsettled: the call is recorded but its result has not landed. Mid-turn that means it is
    // happening now; after the turn settles (done/aborted) there is nothing left in flight.
    return running ? 'running' : 'ok';
};

/** Messages the user should see as prose: their own turns and the agent's text replies. */
const isProse = (m: Message): boolean =>
    m.role === 'user' || (m.role === 'assistant' && !!m.content && m.content.trim().length > 0);

/**
 * Groups the transcript into prose and one ledger per user request. Every write between two user
 * messages belongs to the same request, so a turn that loops (think → act → think → act) still
 * reads as a single body of work rather than several disconnected ones.
 */
export const buildTranscript = (session: SessionState | null): TranscriptItem[] => {
    const messages = session?.messages ?? [];
    const running = session?.phase === 'thinking';
    const settledCallIds = new Set(
        messages.filter(m => m.role === 'tool' && m.toolCallId).map(m => m.toolCallId as string)
    );

    const items: TranscriptItem[] = [];
    let ledger: { kind: 'ledger'; id: string; ops: LedgerOp[] } | null = null;

    for (const message of messages) {
        if (message.role === 'user') {
            ledger = null;
        }

        for (const call of message.toolCalls ?? []) {
            const args = parseArgs(call.args);
            const status = statusOf(call.status, settledCallIds.has(call.id), running);
            const ops =
                call.name === 'spawn'
                    ? spawnOps(call.id, args, status)
                    : WRITE_KINDS[call.name]
                      ? [
                            {
                                id: call.id,
                                kind: WRITE_KINDS[call.name],
                                status,
                                ...partsFor(WRITE_KINDS[call.name], args),
                            },
                        ]
                      : [];
            if (ops.length === 0) {
                continue;
            }
            if (!ledger) {
                ledger = { kind: 'ledger', id: `ledger-${message.id}`, ops: [] };
                items.push(ledger);
            }
            ledger.ops.push(...ops);
        }

        if (isProse(message)) {
            items.push({ kind: 'message', id: message.id, message });
        }
    }

    return items;
};

/** How close to the bottom still counts as "following along" — roughly one line of transcript. */
const STICK_THRESHOLD_PX = 48;

/**
 * Whether a scroller is close enough to the end that new content should keep it pinned there. A turn
 * saves after every tool result, so pinning unconditionally would drag the user back down each time
 * they scrolled up to re-read something mid-turn.
 */
export const isFollowingTail = (el: Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight'>): boolean =>
    el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_THRESHOLD_PX;

/** What the assistant panel may be dragged to. Narrow enough to keep the canvas usable, wide enough
 *  that a long reply and a deep ledger both fit without the transcript turning into a column of scraps. */
export const PANEL_MIN_WIDTH = 320;
export const PANEL_MAX_WIDTH = 640;
export const PANEL_DEFAULT_WIDTH = 360;

/** Clamps a dragged or restored width into the allowed range; anything unusable falls back to the default. */
export const clampPanelWidth = (raw: number): number => {
    if (!Number.isFinite(raw)) {
        return PANEL_DEFAULT_WIDTH;
    }
    return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, Math.round(raw)));
};
