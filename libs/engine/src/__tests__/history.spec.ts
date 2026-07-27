import { describe, expect, it } from 'vitest';

import { HISTORY_LIMIT } from '../core/history';
import { createFlowEngine } from '../engine';

import type { Position } from '@lemoncloud/eureka-flows-api';

const at = (x: number, y: number): Position => ({ x, y });

const addNode = (engine: ReturnType<typeof createFlowEngine>, label = 'node:add'): string => {
    let id = '';
    engine.transact(label, ops => {
        id = ops.addNode({ type: 'input-text', position: at(0, 0) });
    });
    return id;
};

describe('history', () => {
    it('starts with nothing to undo or redo', () => {
        const engine = createFlowEngine();

        expect(engine.canUndo()).toBe(false);
        expect(engine.canRedo()).toBe(false);
        expect(engine.undo()).toBe(false);
        expect(engine.redo()).toBe(false);
    });

    it('walks back and forward over a transaction', () => {
        const engine = createFlowEngine();
        addNode(engine);

        expect(engine.getGraph().nodes).toHaveLength(1);
        expect(engine.canUndo()).toBe(true);

        expect(engine.undo()).toBe(true);
        expect(engine.getGraph().nodes).toHaveLength(0);
        expect(engine.canRedo()).toBe(true);

        expect(engine.redo()).toBe(true);
        expect(engine.getGraph().nodes).toHaveLength(1);
    });

    it('returns the same graph after a full round trip', () => {
        const engine = createFlowEngine();
        const first = addNode(engine);
        engine.transact('node:move', ops => ops.updateNode(first, { position: at(120, 40) }));

        const before = engine.getGraph();
        engine.undo();
        engine.redo();

        expect(engine.getGraph()).toEqual(before);
    });

    it('undoes one transaction per call, however many ops it held', () => {
        const engine = createFlowEngine();
        engine.transact('bulk', ops => {
            ops.addNode({ type: 'input-text', position: at(0, 0) });
            ops.addNode({ type: 'input-text', position: at(100, 0) });
            ops.addNode({ type: 'input-text', position: at(200, 0) });
        });

        expect(engine.getGraph().nodes).toHaveLength(3);
        engine.undo();
        expect(engine.getGraph().nodes).toHaveLength(0);
    });

    it('drops the redo stack once a new change lands', () => {
        const engine = createFlowEngine();
        addNode(engine);
        engine.undo();
        expect(engine.canRedo()).toBe(true);

        addNode(engine);

        expect(engine.canRedo()).toBe(false);
    });

    it('leaves the graph and the history untouched when a transaction throws', () => {
        const engine = createFlowEngine();
        const first = addNode(engine);
        const before = engine.getGraph();

        expect(() =>
            engine.transact('half-done', ops => {
                ops.addNode({ type: 'input-text', position: at(500, 500) });
                throw new Error('changed my mind');
            })
        ).toThrow('changed my mind');

        expect(engine.getGraph()).toEqual(before);
        // The failed transaction must not be undoable — undoing here would roll back the
        // node that did land, which the user never asked to remove.
        engine.undo();
        expect(engine.getGraph().nodes).toHaveLength(0);
        expect(engine.canUndo()).toBe(false);
        expect(first).toBeTruthy();
    });

    it('forgets the oldest entry past the cap', () => {
        const engine = createFlowEngine();
        for (let i = 0; i < HISTORY_LIMIT + 10; i++) addNode(engine);

        let undone = 0;
        while (engine.undo()) undone++;

        expect(undone).toBe(HISTORY_LIMIT);
        // The ten oldest additions are past the horizon, so undo cannot reach the empty graph.
        expect(engine.getGraph().nodes).toHaveLength(10);
    });

    it('forgets everything a load replaces', () => {
        const engine = createFlowEngine();
        addNode(engine);

        engine.loadGraph({ nodes: [], edges: [] });

        expect(engine.canUndo()).toBe(false);
        expect(engine.canRedo()).toBe(false);
    });

    it('hands out copies, so an undo target cannot be edited from outside', () => {
        const engine = createFlowEngine();
        const id = addNode(engine);

        const graph = engine.getGraph();
        graph.nodes[0].position = at(999, 999);

        expect(engine.getGraph().nodes[0].position).toEqual(at(0, 0));
        expect(engine.getGraph().nodes[0].id).toBe(id);
    });
});
