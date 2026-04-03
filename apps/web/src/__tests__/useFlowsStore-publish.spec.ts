import { beforeEach, describe, expect, it } from 'vitest';

import { useFlowsStore } from '@flows/flows';

import type { PublishMeta } from '@flows/flows';

describe('useFlowsStore - Publish Meta', () => {
    beforeEach(() => {
        useFlowsStore.setState({
            flowMeta: null,
            currentFlowId: 'test-flow-1',
            flowName: 'Test Flow',
            flowDescription: '',
        });
    });

    describe('setFlowMeta', () => {
        it('should set publish meta', () => {
            const meta: PublishMeta = {
                isPublic: true,
                publishedAt: '2026-04-03T00:00:00.000Z',
            };

            useFlowsStore.getState().setFlowMeta(meta);
            expect(useFlowsStore.getState().flowMeta).toEqual(meta);
        });

        it('should clear publish meta when set to null', () => {
            useFlowsStore.getState().setFlowMeta({ isPublic: true });
            useFlowsStore.getState().setFlowMeta(null);
            expect(useFlowsStore.getState().flowMeta).toBeNull();
        });

        it('should update meta without affecting other state', () => {
            const originalName = useFlowsStore.getState().flowName;
            const originalId = useFlowsStore.getState().currentFlowId;

            useFlowsStore.getState().setFlowMeta({ isPublic: true });

            expect(useFlowsStore.getState().flowName).toBe(originalName);
            expect(useFlowsStore.getState().currentFlowId).toBe(originalId);
        });
    });

    describe('flowMeta with isPublic', () => {
        it('should default to null (private)', () => {
            expect(useFlowsStore.getState().flowMeta).toBeNull();
        });

        it('should track public state', () => {
            useFlowsStore.getState().setFlowMeta({ isPublic: true });
            expect(useFlowsStore.getState().flowMeta?.isPublic).toBe(true);
        });

        it('should allow unpublishing', () => {
            useFlowsStore.getState().setFlowMeta({ isPublic: true });
            useFlowsStore.getState().setFlowMeta({ isPublic: false });
            expect(useFlowsStore.getState().flowMeta?.isPublic).toBe(false);
        });
    });

    describe('flowDescription', () => {
        it('should default to empty string', () => {
            expect(useFlowsStore.getState().flowDescription).toBe('');
        });

        it('should set flow description', () => {
            useFlowsStore.getState().setFlowDescription('A test flow description');
            expect(useFlowsStore.getState().flowDescription).toBe('A test flow description');
        });

        it('should update independently from flowMeta', () => {
            useFlowsStore.getState().setFlowDescription('desc');
            useFlowsStore.getState().setFlowMeta({ isPublic: true });
            expect(useFlowsStore.getState().flowDescription).toBe('desc');
        });
    });
});
