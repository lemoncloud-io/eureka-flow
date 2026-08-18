import { describe, expect, it } from 'vitest';

import { buildTranscript, isFollowingTail } from './agentTurnLedger';

import type { LedgerOp, TranscriptItem } from './agentTurnLedger';
import type { Message, SessionState } from '@flows/agent';

const user = (id: string, content: string): Message => ({ id, role: 'user', content, ts: 0 });

const assistant = (id: string, toolCalls: Message['toolCalls'], content?: string): Message => ({
    id,
    role: 'assistant',
    ...(content ? { content } : {}),
    ...(toolCalls ? { toolCalls } : {}),
    ts: 0,
});

const toolResult = (id: string, toolCallId: string): Message => ({
    id,
    role: 'tool',
    content: 'ok',
    toolCallId,
    ts: 0,
});

const call = (id: string, name: string, args: unknown, status: 'ok' | 'error' = 'ok') => ({
    id,
    name,
    args: JSON.stringify(args),
    status,
});

const session = (messages: Message[], phase: SessionState['phase'] = 'done'): SessionState => ({
    flowId: 'f1',
    messages,
    phase,
});

const ledgers = (items: TranscriptItem[]): LedgerOp[][] =>
    items.filter((i): i is Extract<TranscriptItem, { kind: 'ledger' }> => i.kind === 'ledger').map(i => i.ops);

describe('buildTranscript', () => {
    it('keeps the writes and drops the reads', () => {
        const items = buildTranscript(
            session([
                user('u1', 'build it'),
                assistant('a1', [
                    call('c1', 'get_graph', {}),
                    call('c2', 'list_nodes', {}),
                    call('c3', 'add_node', { type: 'generate', position: { x: 0, y: 0 } }),
                ]),
                toolResult('t1', 'c3'),
            ])
        );

        expect(ledgers(items)).toEqual([[{ id: 'c3', kind: 'add', status: 'ok', subject: 'generate' }]]);
    });

    it('names each verb off its own arguments', () => {
        const items = buildTranscript(
            session([
                user('u1', 'edit'),
                assistant('a1', [
                    call('c1', 'connect_nodes', {
                        sourceNodeId: 'n1',
                        sourcePortId: 'out',
                        targetNodeId: 'n2',
                        targetPortId: 'in',
                    }),
                    call('c2', 'rename', { nodeId: 'n2', label: 'Result' }),
                    call('c3', 'move_node', { nodeId: 'n2', dx: 40, dy: 0 }),
                ]),
                toolResult('t1', 'c1'),
                toolResult('t2', 'c2'),
                toolResult('t3', 'c3'),
            ])
        );

        expect(ledgers(items)[0]).toEqual([
            { id: 'c1', kind: 'connect', status: 'ok', subject: 'n1', object: 'n2' },
            { id: 'c2', kind: 'rename', status: 'ok', subject: 'n2', object: 'Result' },
            { id: 'c3', kind: 'move', status: 'ok', subject: 'n2' },
        ]);
    });

    it('expands a spawn fan-out into one row per delegated task', () => {
        const items = buildTranscript(
            session([
                user('u1', 'build it'),
                assistant('a1', [
                    call('c1', 'spawn', {
                        children: [
                            { task: 'lay out', agentType: 'builder' },
                            { task: 'write titles', agentType: 'single-output-generator' },
                        ],
                    }),
                ]),
                toolResult('t1', 'c1'),
            ])
        );

        expect(ledgers(items)[0]).toEqual([
            { id: 'c1:0', kind: 'delegate', status: 'ok', subject: 'builder' },
            { id: 'c1:1', kind: 'delegate', status: 'ok', subject: 'single-output-generator' },
        ]);
    });

    it('marks an unsettled call as running only while the turn is in flight', () => {
        const messages = [
            user('u1', 'move it'),
            assistant('a1', [call('c1', 'move_node', { nodeId: 'n1' }), call('c2', 'move_node', { nodeId: 'n2' })]),
            toolResult('t1', 'c1'),
        ];

        expect(ledgers(buildTranscript(session(messages, 'thinking')))[0].map(op => op.status)).toEqual([
            'ok',
            'running',
        ]);
        // The same transcript once the turn settles: nothing is in flight any more.
        expect(ledgers(buildTranscript(session(messages, 'done')))[0].map(op => op.status)).toEqual(['ok', 'ok']);
    });

    it('reports a failed call as failed even mid-turn', () => {
        const items = buildTranscript(
            session(
                [user('u1', 'delete it'), assistant('a1', [call('c1', 'delete_node', { nodeId: 'n9' }, 'error')])],
                'thinking'
            )
        );

        expect(ledgers(items)[0]).toEqual([{ id: 'c1', kind: 'delete', status: 'error', subject: 'n9' }]);
    });

    it('collects a looping turn into one ledger, and starts a new one per request', () => {
        const items = buildTranscript(
            session([
                user('u1', 'build it'),
                assistant('a1', [call('c1', 'add_node', { type: 'input' })]),
                toolResult('t1', 'c1'),
                assistant('a2', [call('c2', 'add_node', { type: 'generate' })]),
                toolResult('t2', 'c2'),
                assistant('a3', undefined, 'Done — two blocks added.'),
                user('u2', 'now tidy up'),
                assistant('a4', [call('c3', 'move_node', { nodeId: 'n1' })]),
                toolResult('t3', 'c3'),
            ])
        );

        expect(ledgers(items).map(ops => ops.length)).toEqual([2, 1]);
        // The work is shown before the reply that describes it.
        expect(items.map(i => i.kind)).toEqual(['message', 'ledger', 'message', 'message', 'ledger']);
    });

    it('survives arguments that are not the shape the tool declared', () => {
        const items = buildTranscript(
            session([
                user('u1', 'x'),
                assistant('a1', [
                    { id: 'c1', name: 'add_node', args: 'not json', status: 'ok' },
                    call('c2', 'spawn', { children: 'nope' }),
                ]),
            ])
        );

        expect(ledgers(items)[0]).toEqual([
            { id: 'c1', kind: 'add', status: 'ok' },
            { id: 'c2', kind: 'delegate', status: 'ok' },
        ]);
    });

    it('renders nothing for an empty or missing session', () => {
        expect(buildTranscript(null)).toEqual([]);
        expect(buildTranscript(session([]))).toEqual([]);
    });
});

describe('isFollowingTail', () => {
    const at = (scrollTop: number) => ({ scrollTop, scrollHeight: 1000, clientHeight: 400 });

    it('follows while the reader is at the end', () => {
        expect(isFollowingTail(at(600))).toBe(true);
    });

    it('still follows within a line of the end, so a rounding pixel does not unstick it', () => {
        expect(isFollowingTail(at(560))).toBe(true);
    });

    it('lets go once the reader has scrolled back', () => {
        expect(isFollowingTail(at(400))).toBe(false);
        expect(isFollowingTail(at(0))).toBe(false);
    });
});
