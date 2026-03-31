import { beforeEach, describe, expect, it } from 'vitest';

import { useCanvasStore } from '@flows/flows';

import type { NodeData } from '@lemoncloud/eureka-flows-api';

const makeNode = (id: string, x = 0, y = 0): NodeData => ({ id, type: 'test', position: { x, y } }) as NodeData;

describe('useCanvasStore - Node Collapse', () => {
    beforeEach(() => {
        useCanvasStore.setState({
            nodes: [makeNode('a'), makeNode('b'), makeNode('c')],
            collapsedNodeIds: new Set(),
        });
    });

    describe('toggleNodeCollapsed', () => {
        it('should collapse a node', () => {
            useCanvasStore.getState().toggleNodeCollapsed('a');
            expect(useCanvasStore.getState().collapsedNodeIds.has('a')).toBe(true);
            expect(useCanvasStore.getState().collapsedNodeIds.size).toBe(1);
        });

        it('should expand a collapsed node', () => {
            useCanvasStore.getState().toggleNodeCollapsed('a');
            useCanvasStore.getState().toggleNodeCollapsed('a');
            expect(useCanvasStore.getState().collapsedNodeIds.has('a')).toBe(false);
        });

        it('should handle multiple nodes independently', () => {
            useCanvasStore.getState().toggleNodeCollapsed('a');
            useCanvasStore.getState().toggleNodeCollapsed('b');
            const collapsed = useCanvasStore.getState().collapsedNodeIds;
            expect(collapsed.has('a')).toBe(true);
            expect(collapsed.has('b')).toBe(true);
            expect(collapsed.has('c')).toBe(false);
        });
    });

    describe('setAllNodesCollapsed', () => {
        it('should collapse all nodes', () => {
            useCanvasStore.getState().setAllNodesCollapsed(true);
            const collapsed = useCanvasStore.getState().collapsedNodeIds;
            expect(collapsed.size).toBe(3);
            expect(collapsed.has('a')).toBe(true);
            expect(collapsed.has('b')).toBe(true);
            expect(collapsed.has('c')).toBe(true);
        });

        it('should expand all nodes', () => {
            useCanvasStore.getState().setAllNodesCollapsed(true);
            useCanvasStore.getState().setAllNodesCollapsed(false);
            expect(useCanvasStore.getState().collapsedNodeIds.size).toBe(0);
        });
    });

    describe('workflow lifecycle resets collapsed state', () => {
        it('should reset on loadWorkflow', () => {
            useCanvasStore.getState().toggleNodeCollapsed('a');
            useCanvasStore.getState().loadWorkflow({ nodes: [], edges: [] });
            expect(useCanvasStore.getState().collapsedNodeIds.size).toBe(0);
        });

        it('should reset on clearWorkflow', () => {
            useCanvasStore.getState().toggleNodeCollapsed('a');
            useCanvasStore.getState().clearWorkflow();
            expect(useCanvasStore.getState().collapsedNodeIds.size).toBe(0);
        });

        it('should reset on resetCanvas', () => {
            useCanvasStore.getState().toggleNodeCollapsed('a');
            useCanvasStore.getState().resetCanvas();
            expect(useCanvasStore.getState().collapsedNodeIds.size).toBe(0);
        });
    });
});
