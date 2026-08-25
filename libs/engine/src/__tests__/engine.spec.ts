import { describe, expect, it } from 'vitest';

import { createFlowEngine } from '../engine';
import { diffSnapshots } from '../persistence/diff';
import { emptySnapshot, toSnapshot } from '../persistence/snapshot';

import type { EngineEvent } from '../core/document';
import type { BlockDefinitionWithFrontend } from '../types';
import type { Position } from '@lemoncloud/eureka-flows-api';

const at = (x: number, y: number): Position => ({ x, y });

const registry = {
    'input-text': { type: 'input-text', inputs: [], outputs: [{ id: 'out', type: 'text' }] },
} as unknown as Record<string, BlockDefinitionWithFrontend>;

const record = (engine: ReturnType<typeof createFlowEngine>): EngineEvent[] => {
    const seen: EngineEvent[] = [];
    engine.subscribe(event => seen.push(event));
    return seen;
};

describe('events', () => {
    it('reports a commit before it reports what undo can now reach', () => {
        const engine = createFlowEngine();
        const seen = record(engine);

        engine.transact('node:add', ops => ops.addNode({ type: 'input-text', position: at(0, 0) }));

        expect(seen).toEqual([
            { type: 'graph:changed', label: 'node:add' },
            { type: 'history:changed', canUndo: true, canRedo: false },
        ]);
    });

    it('labels undo and redo distinctly from the edit that caused them', () => {
        const engine = createFlowEngine();
        engine.transact('node:add', ops => ops.addNode({ type: 'input-text', position: at(0, 0) }));
        const seen = record(engine);

        engine.undo();
        engine.redo();

        expect(seen.filter(e => e.type === 'graph:changed')).toEqual([
            { type: 'graph:changed', label: 'history:undo' },
            { type: 'graph:changed', label: 'history:redo' },
        ]);
    });

    it('says nothing when a transaction throws', () => {
        const engine = createFlowEngine();
        const seen = record(engine);

        expect(() =>
            engine.transact('doomed', () => {
                throw new Error('no');
            })
        ).toThrow();

        expect(seen).toEqual([]);
    });

    it('announces a load without calling it a change', () => {
        const engine = createFlowEngine();
        const seen = record(engine);

        engine.loadGraph({ nodes: [], edges: [] });

        expect(seen.map(e => e.type)).toEqual(['graph:loaded', 'history:changed']);
    });

    it('stops talking to a listener that unsubscribed', () => {
        const engine = createFlowEngine();
        const seen: EngineEvent[] = [];
        const stop = engine.subscribe(event => seen.push(event));

        stop();
        engine.transact('node:add', ops => ops.addNode({ type: 'input-text', position: at(0, 0) }));

        expect(seen).toEqual([]);
    });
});

describe('applyRuntime', () => {
    it('is not an edit: no checkpoint, no graph:changed', () => {
        const engine = createFlowEngine();
        let id = '';
        engine.transact('node:add', ops => {
            id = ops.addNode({ type: 'input-text', position: at(0, 0) });
        });
        engine.undo();
        engine.redo();
        const seen = record(engine);

        engine.applyRuntime(id, { state: 'RUNNING', status: 'RUNNING' } as never);

        expect(seen).toEqual([{ type: 'graph:runtime', nodeId: id }]);
        expect(engine.canUndo()).toBe(true);
        engine.undo();
        // Undo reaches past the run to the empty graph — the run was never a step.
        expect(engine.getGraph().nodes).toHaveLength(0);
    });

    it('does not make a flow dirty', () => {
        const engine = createFlowEngine();
        let id = '';
        engine.transact('node:add', ops => {
            id = ops.addNode({ type: 'input-text', position: at(0, 0) });
        });
        const baseline = toSnapshot(engine.getGraph(), registry);

        engine.applyRuntime(id, {
            state: 'COMPLETED',
            status: 'COMPLETED',
            outputData: { out: { value: 'done', type: 'text' } },
            executionStats: { startTime: 1, duration: 2 },
        } as never);

        expect(diffSnapshots(toSnapshot(engine.getGraph(), registry), baseline).isEmpty).toBe(true);
    });

    it('ignores a node the graph does not have', () => {
        const engine = createFlowEngine();
        const seen = record(engine);

        engine.applyRuntime('ghost', { state: 'RUNNING' } as never);

        expect(seen).toEqual([]);
    });

    it('merges the patch over what the node already had', () => {
        const engine = createFlowEngine();
        let id = '';
        engine.transact('node:add', ops => {
            id = ops.addNode({ type: 'input-text', position: at(10, 10), config: { value: 'keep' } });
        });

        engine.applyRuntime(id, { state: 'RUNNING' } as never);

        const node = engine.getGraph().nodes[0];
        expect(node.state).toBe('RUNNING');
        expect(node.config).toEqual({ value: 'keep' });
        expect(node.position).toEqual(at(10, 10));
    });
});

describe('loadGraph', () => {
    it('fills in the fields the wire leaves off', () => {
        const engine = createFlowEngine();

        engine.loadGraph({ nodes: [{ id: 'n1', type: 'input-text' }], edges: [] } as never);

        const [node] = engine.getGraph().nodes;
        expect(node.position).toEqual(at(0, 0));
        expect(node.config).toEqual({});
    });

    it('collapses edges left over from before edges carried ids', () => {
        const engine = createFlowEngine();

        engine.loadGraph({
            nodes: [{ id: 'a', type: 'input-text', position: at(0, 0) }],
            edges: [
                { id: 'e1', sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'b', targetPortId: 'in' },
                { id: 'e2', sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'b', targetPortId: 'in' },
            ],
        } as never);

        expect(engine.getGraph().edges).toHaveLength(1);
    });

    it('replaces rather than merges', () => {
        const engine = createFlowEngine();
        engine.transact('node:add', ops => ops.addNode({ type: 'input-text', position: at(0, 0) }));

        engine.loadGraph({ nodes: [{ id: 'n1', type: 'input-text', position: at(5, 5) }], edges: [] } as never);

        expect(engine.getGraph().nodes.map(n => n.id)).toEqual(['n1']);
    });
});

describe('reset', () => {
    it('empties the graph and the history', () => {
        const engine = createFlowEngine();
        engine.transact('node:add', ops => ops.addNode({ type: 'input-text', position: at(0, 0) }));

        engine.reset();

        expect(engine.getGraph()).toEqual(emptySnapshot());
        expect(engine.canUndo()).toBe(false);
    });
});
