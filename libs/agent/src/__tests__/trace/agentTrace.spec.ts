import { describe, expect, it } from 'vitest';

import { createAgentTrace } from '../../trace';
import { TURN_DONE, TURN_START } from '../../trace/events';

describe('createAgentTrace', () => {
    it('disabled ⇒ NoopTracer, zero records, empty projections', () => {
        const trace = createAgentTrace(false);
        trace.tracer.emit({ name: TURN_START, fields: {} }); // NoopTracer swallows it

        expect(trace.records()).toEqual([]);
        const p = trace.project();
        expect(p.transcripts).toEqual([]);
        expect(p.tree).toBeNull();
        expect(p.diff).toEqual({ cumulative: null, perTurn: [] });
    });

    it('enabled ⇒ diff is a cumulative session delta plus one delta per turn, in turn order', () => {
        const trace = createAgentTrace(true);
        const root = (runId: string) =>
            trace.tracer.child({
                runId,
                'gen_ai.agent.name': 'orchestrator',
                'gen_ai.agent.id': 'orchestrator',
                flowPath: 'flow',
            });
        const a = { id: 'a', type: 'input-text' };
        const b = { id: 'b', type: 'buffer' };

        const t1 = root('run-1');
        t1.emit({ name: TURN_START, fields: { graph: { nodes: [], edges: [] } } });
        t1.emit({ name: TURN_DONE, fields: { graph: { nodes: [a], edges: [] } } });
        const t2 = root('run-2');
        t2.emit({ name: TURN_START, fields: { graph: { nodes: [a], edges: [] } } });
        t2.emit({ name: TURN_DONE, fields: { graph: { nodes: [a, b], edges: [] } } });

        const { cumulative, perTurn } = trace.project().diff;
        expect(perTurn.map(d => d.runId)).toEqual(['run-1', 'run-2']);
        expect(cumulative?.addedNodes).toEqual([a, b]); // whole session
        expect(perTurn[0].addedNodes).toEqual([a]); // turn 1 only
        expect(perTurn[1].addedNodes).toEqual([b]); // turn 2 only
    });
});
