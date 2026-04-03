import { beforeEach, describe, expect, it } from 'vitest';

import { useFlowsStore } from '@flows/flows';

import type { PublishMeta } from '@flows/flows';

describe('useFlowsStore - Publish Meta', () => {
    beforeEach(() => {
        useFlowsStore.setState({
            flowMeta: null,
            currentFlowId: 'test-flow-1',
            flowName: 'Test Flow',
        });
    });

    describe('setFlowMeta', () => {
        it('should set publish meta', () => {
            const meta: PublishMeta = {
                isPublic: true,
                publishTitle: 'My Published Flow',
                publishDescription: 'A test flow',
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
            useFlowsStore.getState().setFlowMeta({ isPublic: true, publishTitle: 'Test' });
            useFlowsStore.getState().setFlowMeta({ isPublic: false, publishTitle: 'Test' });
            expect(useFlowsStore.getState().flowMeta?.isPublic).toBe(false);
        });

        it('should preserve publish metadata fields', () => {
            const meta: PublishMeta = {
                isPublic: true,
                publishTitle: 'Custom Title',
                publishDescription: 'Custom Description',
                publishImage: 's3://bucket/image.png',
                publishedAt: '2026-04-03T12:00:00.000Z',
            };

            useFlowsStore.getState().setFlowMeta(meta);
            const stored = useFlowsStore.getState().flowMeta;

            expect(stored?.publishTitle).toBe('Custom Title');
            expect(stored?.publishDescription).toBe('Custom Description');
            expect(stored?.publishImage).toBe('s3://bucket/image.png');
            expect(stored?.publishedAt).toBe('2026-04-03T12:00:00.000Z');
        });
    });
});
