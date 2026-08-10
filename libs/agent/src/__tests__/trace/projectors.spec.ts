import { beforeEach, describe, expect, it } from 'vitest';

import { createTracer } from '../../trace/createTracer';
import { CANVAS_MUTATE, MESSAGE, TOOL_CALL, TOOL_RESULT, TURN_DONE, TURN_START } from '../../trace/events';
import { toGraphDiff, toTraceTree, toTranscripts } from '../../trace/project';
import { memorySink } from '../../trace/sinks';

import type { TraceRecord } from '../../trace/sink';

/** One request: orchestrator plans → spawns builder#1 → builder adds node n9 → orchestrator replies. */
const buildRun = (): TraceRecord[] => {
    const sink = memorySink();
    let clock = 0;
    const root = createTracer(sink, () => (clock += 1)).child({
        runId: 'r42',
        'gen_ai.agent.name': 'orchestrator',
        'gen_ai.agent.id': 'orchestrator',
        flowPath: 'r42',
    });

    root.emit({ name: TURN_START, fields: { turn: 0, graph: { nodes: [], edges: [] } } });
    root.emit({ name: MESSAGE, fields: { role: 'user', content: 'add an http node' } });
    root.emit({
        name: MESSAGE,
        fields: { role: 'assistant', content: '', toolCalls: [{ name: 'spawn_agent', args: '{}' }] },
    });

    const builder = root.child({
        'gen_ai.agent.name': 'builder',
        'gen_ai.agent.id': 'builder#1',
        flowPath: 'r42:builder#1',
    });
    builder.emit({ name: MESSAGE, fields: { role: 'user', content: 'add an http_request node at (400,200)' } });
    builder.emit({
        name: MESSAGE,
        fields: { role: 'assistant', content: '', toolCalls: [{ name: 'add_node', args: '{"type":"http_request"}' }] },
    });
    builder.emit({ name: TOOL_CALL, fields: { toolCallId: 'tc7', name: 'add_node' } });
    builder.emit({ name: CANVAS_MUTATE, fields: { op: 'addNode', nodeId: 'n9' } });
    builder.emit({ name: TOOL_RESULT, fields: { toolCallId: 'tc7', ok: true } });
    builder.emit({ name: MESSAGE, fields: { role: 'tool', content: 'ok: created n9', toolCallId: 'tc7' } });
    builder.emit({ name: MESSAGE, fields: { role: 'assistant', content: 'Added the HTTP request node (n9).' } });

    root.emit({ name: MESSAGE, fields: { role: 'tool', content: 'ok', toolCallId: 'spawn1' } });
    root.emit({ name: MESSAGE, fields: { role: 'assistant', content: 'Done — added an HTTP node.' } });
    root.emit({
        name: TURN_DONE,
        fields: { turn: 0, graph: { nodes: [{ id: 'n9', type: 'http_request' }], edges: [] } },
    });

    return sink.records;
};

describe('trace projectors', () => {
    let records: TraceRecord[];
    beforeEach(() => {
        records = buildRun();
    });

    it('toTranscripts: one chat per instance, chronological, tool calls inline, no raw id in role labels', () => {
        const transcripts = toTranscripts(records);
        expect(transcripts.map(t => t.agentId).sort()).toEqual(['builder#1', 'orchestrator']);

        const builder = transcripts.find(t => t.agentId === 'builder#1');
        expect(builder?.chat.map(e => e.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
        expect(builder?.chat[1].toolCalls).toEqual([{ name: 'add_node', args: '{"type":"http_request"}' }]);
        expect(builder?.chat[2].toolCallId).toBe('tc7');
    });

    it('toTraceTree: orchestrator root with builder#1 nested under it by flowPath', () => {
        const root = toTraceTree(records);
        expect(root?.agentId).toBe('orchestrator');
        expect(root?.flowPath).toBe('r42');
        expect(root?.children.map(c => c.agentId)).toEqual(['builder#1']);
        expect(root?.children[0].flowPath).toBe('r42:builder#1');
    });

    it('toGraphDiff: root before/after delta = the added node, self-describing (id + type)', () => {
        const diff = toGraphDiff(records, 'r42');
        expect(diff.before.nodes).toEqual([]);
        expect(diff.after.nodes).toEqual([{ id: 'n9', type: 'http_request' }]);
        expect(diff.addedNodes).toEqual([{ id: 'n9', type: 'http_request' }]);
        expect(diff.removedNodes).toEqual([]);
        expect(diff.changedNodes).toEqual([]);
    });

    it('toGraphDiff: added/removed edges carry their endpoints, not just a count', () => {
        const sink = memorySink();
        const root = createTracer(sink).child({
            runId: 'r7',
            'gen_ai.agent.name': 'orchestrator',
            'gen_ai.agent.id': 'orchestrator',
            flowPath: 'r7',
        });
        const nodes = [
            { id: 'a', type: 'input-text' },
            { id: 'b', type: 'output-preview' },
        ];
        const e1 = { id: 'e1', sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'b', targetPortId: 'in' };
        root.emit({ name: TURN_START, fields: { turn: 0, graph: { nodes, edges: [e1] } } });
        root.emit({ name: TURN_DONE, fields: { turn: 0, graph: { nodes, edges: [] } } });

        const diff = toGraphDiff(sink.records, 'r7');
        expect(diff.addedNodes).toEqual([]);
        expect(diff.addedEdges).toEqual([]);
        expect(diff.removedEdges).toEqual([e1]);
    });

    it('toGraphDiff: omitting runId gives the cumulative session delta across turns', () => {
        const sink = memorySink();
        const tracer = createTracer(sink);
        const root = (runId: string) =>
            tracer.child({
                runId,
                'gen_ai.agent.name': 'orchestrator',
                'gen_ai.agent.id': 'orchestrator',
                flowPath: 'flow', // constant root flowPath across turns, as in a live session
            });
        const a = { id: 'a', type: 'input-text' };
        const b = { id: 'b', type: 'buffer' };

        const t1 = root('run-1');
        t1.emit({ name: TURN_START, fields: { graph: { nodes: [], edges: [] } } });
        t1.emit({ name: TURN_DONE, fields: { graph: { nodes: [a], edges: [] } } });
        const t2 = root('run-2');
        t2.emit({ name: TURN_START, fields: { graph: { nodes: [a], edges: [] } } });
        t2.emit({ name: TURN_DONE, fields: { graph: { nodes: [a, b], edges: [] } } });

        const cumulative = toGraphDiff(sink.records); // no runId → first turn's before → last turn's after
        expect(cumulative.runId).toBe('session');
        expect(cumulative.addedNodes).toEqual([a, b]);

        const turn2 = toGraphDiff(sink.records, 'run-2'); // just that turn's delta
        expect(turn2.addedNodes).toEqual([b]);
    });
});
