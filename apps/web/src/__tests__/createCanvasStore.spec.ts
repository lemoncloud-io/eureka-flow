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
