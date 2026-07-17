import { beforeEach, describe, expect, it } from 'vitest';

import { createCanvasStore, useCanvasStore } from '@flows/flows';

import type { NodeData } from '@lemoncloud/eureka-flows-api';

const makeNode = (id: string, x = 0, y = 0): NodeData => ({ id, type: 'test', position: { x, y } }) as NodeData;

describe('createCanvasStore - headless draft isolation', () => {
    beforeEach(() => {
        useCanvasStore.getState().resetCanvas();
        useCanvasStore.setState({ nodes: [makeNode('live')], connections: [] });
    });

    it('starts from initial state, not from the live store', () => {
        const draft = createCanvasStore();
        expect(draft.getState().nodes).toEqual([]);
        expect(useCanvasStore.getState().nodes).toHaveLength(1);
    });

    it('leaves the live canvas untouched when the draft is loaded and mutated', () => {
        const draft = createCanvasStore();

        draft.getState().loadWorkflow({ nodes: [makeNode('a'), makeNode('b')], edges: [] });
        draft.getState().updateNodeData('a', { position: { x: 99, y: 99 } });
        draft.getState().deleteNode('b');

        expect(draft.getState().nodes.map(n => n.id)).toEqual(['a']);
        expect(draft.getState().nodes[0].position).toEqual({ x: 99, y: 99 });

        expect(useCanvasStore.getState().nodes.map(n => n.id)).toEqual(['live']);
    });

    it('leaves the draft untouched when the live canvas changes', () => {
        const draft = createCanvasStore();
        draft.getState().loadWorkflow({ nodes: [makeNode('a')], edges: [] });

        useCanvasStore.getState().clearWorkflow();

        expect(draft.getState().nodes.map(n => n.id)).toEqual(['a']);
    });

    it('keeps two drafts independent of each other', () => {
        const first = createCanvasStore();
        const second = createCanvasStore();

        first.getState().loadWorkflow({ nodes: [makeNode('a')], edges: [] });

        expect(second.getState().nodes).toEqual([]);
    });

    it('exposes the same actions as the live store', () => {
        const draft = createCanvasStore();
        const liveActions = Object.keys(useCanvasStore.getState()).sort();
        expect(Object.keys(draft.getState()).sort()).toEqual(liveActions);
    });
});

describe('graph writes produce fresh references', () => {
    // The canvas re-renders, and autosave fires, off the identity of these arrays:
    // WorkflowCanvas reads them through selector hooks and its onChange effect keys on
    // [nodes, connections]. Hand back the same array and both go quiet.
    beforeEach(() => {
        useCanvasStore.getState().resetCanvas();
    });

    it('replaces the nodes array on setNodes, for both call forms', () => {
        const before = useCanvasStore.getState().nodes;

        useCanvasStore.getState().setNodes([makeNode('a')]);
        const afterValue = useCanvasStore.getState().nodes;
        expect(afterValue).not.toBe(before);

        useCanvasStore.getState().setNodes(prev => [...prev, makeNode('b')]);
        expect(useCanvasStore.getState().nodes).not.toBe(afterValue);
    });

    it('replaces the arrays on the mutations the canvas drives', () => {
        useCanvasStore.getState().setNodes([makeNode('a'), makeNode('b')]);

        const beforeUpdate = useCanvasStore.getState().nodes;
        useCanvasStore.getState().updateNodeData('a', { position: { x: 5, y: 5 } });
        expect(useCanvasStore.getState().nodes).not.toBe(beforeUpdate);

        const beforeConnect = useCanvasStore.getState().connections;
        useCanvasStore.getState().addConnection({
            id: 'e1',
            sourceNodeId: 'a',
            sourcePortId: 'out',
            targetNodeId: 'b',
            targetPortId: 'in',
        });
        expect(useCanvasStore.getState().connections).not.toBe(beforeConnect);

        const beforeDelete = useCanvasStore.getState().nodes;
        useCanvasStore.getState().deleteNode('b');
        expect(useCanvasStore.getState().nodes).not.toBe(beforeDelete);
    });

    it('notifies subscribers on every graph write', () => {
        const seen: number[] = [];
        const unsubscribe = useCanvasStore.subscribe(state => seen.push(state.nodes.length));

        useCanvasStore.getState().setNodes([makeNode('a')]);
        useCanvasStore.getState().setNodes(prev => [...prev, makeNode('b')]);
        useCanvasStore.getState().deleteNode('a');
        unsubscribe();

        expect(seen).toEqual([1, 2, 1]);
    });
});
