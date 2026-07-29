import { describe, expect, it } from 'vitest';

import { createFlowEngine } from '../engine';

import type { Position } from '@lemoncloud/eureka-flows-api';

const at = (x: number, y: number): Position => ({ x, y });

/** a → b → c, plus a loose node d. */
const graph = () => {
    const engine = createFlowEngine();
    const ids: Record<string, string> = {};
    engine.transact('setup', ops => {
        ids.a = ops.addNode({ type: 'input-text', position: at(0, 0), config: { value: 'hello' } });
        ids.b = ops.addNode({ type: 'process-any', position: at(300, 0), customLabel: 'Middle' });
        ids.c = ops.addNode({ type: 'output-text', position: at(600, 0) });
        ids.d = ops.addNode({ type: 'input-text', position: at(0, 400) });
    });
    engine.transact('wire', ops => {
        ops.connect({ sourceNodeId: ids.a, sourcePortId: 'out', targetNodeId: ids.b, targetPortId: 'in' });
        ops.connect({ sourceNodeId: ids.b, sourcePortId: 'out', targetNodeId: ids.c, targetPortId: 'in' });
    });
    return { engine, ids };
};

describe('copy', () => {
    it('brings the edges that run inside the selection', () => {
        const { engine, ids } = graph();

        const payload = engine.copy([ids.a, ids.b]);

        expect(payload.nodes.map(n => n.id)).toEqual([ids.a, ids.b]);
        expect(payload.edges).toHaveLength(1);
        expect(payload.edges[0].sourceNodeId).toBe(ids.a);
    });

    it('leaves out an edge whose other end is not being copied', () => {
        const { engine, ids } = graph();

        // b → c leaves the selection; copying it would rewire the original c.
        const payload = engine.copy([ids.b]);

        expect(payload.edges).toHaveLength(0);
    });

    it('copies nothing for an empty selection', () => {
        const { engine } = graph();

        expect(engine.copy([])).toEqual({ nodes: [], edges: [] });
    });

    it('detaches the payload from the live graph', () => {
        const { engine, ids } = graph();
        const payload = engine.copy([ids.a]);

        payload.nodes[0].position = at(999, 999);

        expect(engine.getGraph().nodes[0].position).toEqual(at(0, 0));
    });
});

describe('paste', () => {
    it('adds the copied nodes under fresh ids', () => {
        const { engine, ids } = graph();
        const payload = engine.copy([ids.a, ids.b]);

        const pasted = engine.paste(payload, at(40, 40));

        expect(pasted).toHaveLength(2);
        expect(new Set(pasted).size).toBe(2);
        expect(pasted).not.toContain(ids.a);
        expect(engine.getGraph().nodes).toHaveLength(6);
    });

    it('re-points the internal edge at the new nodes, not the originals', () => {
        const { engine, ids } = graph();
        const payload = engine.copy([ids.a, ids.b]);

        const [newA, newB] = engine.paste(payload);

        const graphNow = engine.getGraph();
        expect(graphNow.edges).toHaveLength(3);
        const copied = graphNow.edges.find(e => e.sourceNodeId === newA);
        expect(copied).toBeDefined();
        expect(copied?.targetNodeId).toBe(newB);
        expect(copied?.id).not.toBe(payload.edges[0].id);
    });

    it('offsets the copies and keeps everything else about them', () => {
        const { engine, ids } = graph();
        const payload = engine.copy([ids.b]);

        const [newB] = engine.paste(payload, at(40, 40));

        const node = engine.getGraph().nodes.find(n => n.id === newB);
        expect(node?.position).toEqual(at(340, 40));
        expect(node?.customLabel).toBe('Middle');
        expect(node?.type).toBe('process-any');
    });

    it('pastes a node that has never run, whatever the original had done', () => {
        const { engine, ids } = graph();
        engine.applyRuntime(ids.a, {
            state: 'COMPLETED',
            status: 'COMPLETED',
            outputData: { out: { value: 'result', type: 'text' } },
            errorMessage: 'stale',
        } as never);

        const [newA] = engine.paste(engine.copy([ids.a]));

        const node = engine.getGraph().nodes.find(n => n.id === newA);
        expect(node?.state).toBe('IDLE');
        expect(node?.status).toBe('IDLE');
        expect(node?.outputData).toEqual({});
        expect(node?.inputData).toEqual({});
        expect(node?.errorMessage).toBeUndefined();
        // Config is the user's work and does come along.
        expect(node?.config).toEqual({ value: 'hello' });
    });

    it('deep-copies config, so editing the copy leaves the original alone', () => {
        const { engine, ids } = graph();
        const [newA] = engine.paste(engine.copy([ids.a]));

        engine.transact('node:config', ops => ops.updateNode(newA, { config: { value: 'edited' } }));

        expect(engine.getGraph().nodes.find(n => n.id === ids.a)?.config).toEqual({ value: 'hello' });
    });

    it('can be pasted twice without the two copies colliding', () => {
        const { engine, ids } = graph();
        const payload = engine.copy([ids.a, ids.b]);

        const first = engine.paste(payload);
        const second = engine.paste(payload);

        expect(new Set([...first, ...second]).size).toBe(4);
    });

    it('is one undo step', () => {
        const { engine, ids } = graph();
        const before = engine.getGraph();

        engine.paste(engine.copy([ids.a, ids.b]));
        engine.undo();

        expect(engine.getGraph()).toEqual(before);
    });
});
