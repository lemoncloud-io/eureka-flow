import { describe, expect, it } from 'vitest';

import { emptySnapshot, toSnapshot } from '../persistence/snapshot';

import type { BlockDefinitionWithFrontend } from '../types';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

const registry = {
    'text-input': { type: 'input-text', inputs: [], outputs: [] },
} as unknown as Record<string, BlockDefinitionWithFrontend>;

const node = (over: Partial<NodeData> = {}): NodeData =>
    ({
        id: 'n1',
        type: 'text-input',
        position: { x: 10, y: 20 },
        config: { value: 'hello' },
        ...over,
    }) as NodeData;

describe('toSnapshot', () => {
    it('keeps only what the save API stores', () => {
        const [saved] = toSnapshot({ nodes: [node()] }, registry).nodes;

        expect(saved).toEqual({
            id: 'n1',
            type: 'input-text',
            blockId: 'text-input',
            position: { x: 10, y: 20 },
            config: { value: 'hello' },
        });
    });

    it('drops runtime state, so running a node cannot make a flow dirty', () => {
        const running = node({
            state: 'RUNNING',
            status: 'RUNNING',
            inputData: { in: { value: 'x', type: 'text' } },
            outputData: { out: { value: 'y', type: 'text' } },
            errorMessage: 'boom',
            executionStats: { startTime: 1, duration: 2, progress: 50 },
        } as Partial<NodeData>);

        const [saved] = toSnapshot({ nodes: [running] }, registry).nodes;

        for (const runtime of ['state', 'status', 'inputData', 'outputData', 'errorMessage', 'executionStats']) {
            expect(saved).not.toHaveProperty(runtime);
        }
    });

    it('reads a run and its idle counterpart as the same snapshot', () => {
        const idle = toSnapshot({ nodes: [node()] }, registry);
        const ran = toSnapshot({ nodes: [node({ state: 'COMPLETED' } as Partial<NodeData>)] }, registry);

        expect(ran).toEqual(idle);
    });

    it('takes edges from the legacy `connections` field when `edges` is absent', () => {
        const connections = [
            { id: 'e1', sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'b', targetPortId: 'in' },
        ];

        const snapshot = toSnapshot({ nodes: [], connections } as never, registry);

        expect(snapshot.edges).toEqual(connections);
    });

    it('prefers `edges` over `connections` when a graph carries both', () => {
        const edges = [{ id: 'e1' }] as never;
        const connections = [{ id: 'e2' }] as never;

        expect(toSnapshot({ nodes: [], edges, connections }, registry).edges).toEqual(edges);
    });

    it('falls back to the node type when the registry has never heard of the block', () => {
        const [saved] = toSnapshot({ nodes: [node({ type: 'unknown-block' })] }, registry).nodes;

        expect(saved.type).toBe('unknown-block');
        expect(saved.blockId).toBe('unknown-block');
    });
});

describe('emptySnapshot', () => {
    it('is the baseline for a flow the server does not have yet', () => {
        expect(emptySnapshot()).toEqual({ nodes: [], edges: [] });
    });
});
