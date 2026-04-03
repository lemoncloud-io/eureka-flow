import { beforeEach, describe, expect, it } from 'vitest';

import { useFlowsStore } from '@flows/flows';

describe('useFlowsStore - Public State', () => {
    beforeEach(() => {
        useFlowsStore.setState({
            isPublic: false,
            currentFlowId: 'test-flow-1',
            flowName: 'Test Flow',
            flowDescription: '',
        });
    });

    describe('setIsPublic', () => {
        it('should set public state', () => {
            useFlowsStore.getState().setIsPublic(true);
            expect(useFlowsStore.getState().isPublic).toBe(true);
        });

        it('should set private state', () => {
            useFlowsStore.getState().setIsPublic(true);
            useFlowsStore.getState().setIsPublic(false);
            expect(useFlowsStore.getState().isPublic).toBe(false);
        });

        it('should not affect other state', () => {
            const originalName = useFlowsStore.getState().flowName;
            const originalId = useFlowsStore.getState().currentFlowId;

            useFlowsStore.getState().setIsPublic(true);

            expect(useFlowsStore.getState().flowName).toBe(originalName);
            expect(useFlowsStore.getState().currentFlowId).toBe(originalId);
        });
    });

    describe('isPublic default', () => {
        it('should default to false', () => {
            expect(useFlowsStore.getState().isPublic).toBe(false);
        });
    });

    describe('flowDescription', () => {
        it('should default to empty string', () => {
            expect(useFlowsStore.getState().flowDescription).toBe('');
        });

        it('should set flow description', () => {
            useFlowsStore.getState().setFlowDescription('A test flow');
            expect(useFlowsStore.getState().flowDescription).toBe('A test flow');
        });

        it('should update independently from isPublic', () => {
            useFlowsStore.getState().setFlowDescription('desc');
            useFlowsStore.getState().setIsPublic(true);
            expect(useFlowsStore.getState().flowDescription).toBe('desc');
        });
    });
});
