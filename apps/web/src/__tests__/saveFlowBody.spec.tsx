import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFlows, useFlowsStore } from '@flows/flows';

import type { ReactNode } from 'react';

const postMock = vi.fn();

// Stub web-core so save runs without a real HTTP client. vi.mock is hoisted above
// the import, so @flows/flows resolves against this.
vi.mock('@flows/web-core', () => ({
    API_URL: 'http://test',
    api: {
        post: (...args: unknown[]) => postMock(...args),
        get: vi.fn(),
        delete: vi.fn(),
    },
    withRetry: (fn: () => unknown) => fn(),
}));

const createWrapper = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
};

const node = (id: string, x = 0) => ({
    id,
    type: 'text-input',
    position: { x, y: 0 },
    config: { value: `v-${id}` },
    // runtime-only fields the server must never be asked to store
    state: 'COMPLETED',
    status: 'COMPLETED',
    inputData: { in: { value: 'x', type: 'text' } },
    outputData: { out: { value: 'y', type: 'text' } },
    executionStats: { startTime: 1, duration: 2, progress: 100 },
});

const edge = (id: string, source: string, target: string) => ({
    id,
    sourceNodeId: source,
    sourcePortId: 'out',
    targetNodeId: target,
    targetPortId: 'in',
});

/** The body handed to POST /flows/:id/save */
const savedBody = () => postMock.mock.calls.at(-1)?.[1] as { nodes: { id: string }[]; edges: { id: string }[] };

const savedPath = () => postMock.mock.calls.at(-1)?.[0] as string;

describe('save body', () => {
    beforeEach(() => {
        postMock.mockReset();
        postMock.mockResolvedValue({ data: { id: '1009999' } });
        useFlowsStore.setState({ currentFlowId: null, blockRegistry: {} });
        localStorage.clear();
    });

    it('carries every node under its client-generated id', async () => {
        const { result } = renderHook(() => useFlows(), { wrapper: createWrapper() });

        await result.current.saveCurrentFlow({
            nodes: [node('n01ab', 10), node('n02cd', 20)] as never,
            edges: [edge('e01xy', 'n01ab', 'n02cd')] as never,
        });

        await waitFor(() => expect(postMock).toHaveBeenCalled());
        expect(savedBody().nodes.map(n => n.id)).toEqual(['n01ab', 'n02cd']);
        expect(savedBody().edges.map(e => e.id)).toEqual(['e01xy']);
    });

    it('leaves a deleted node out of the body — that is how a delete reaches the server', async () => {
        useFlowsStore.setState({ currentFlowId: '1008888' });
        const { result } = renderHook(() => useFlows(), { wrapper: createWrapper() });

        // caller dropped n02cd from the working copy
        await result.current.saveCurrentFlow({ nodes: [node('n01ab')] as never, edges: [] });

        await waitFor(() => expect(postMock).toHaveBeenCalled());
        expect(savedPath()).toBe('/flows/1008888/save');
        expect(savedBody().nodes.map(n => n.id)).toEqual(['n01ab']);
    });

    it('sends nodes: [] for an emptied flow rather than omitting the key', async () => {
        // The server only replaces flow membership when body.nodes is a present array;
        // omit it and clearing the canvas would silently leave every node attached.
        useFlowsStore.setState({ currentFlowId: '1008888' });
        const { result } = renderHook(() => useFlows(), { wrapper: createWrapper() });

        await result.current.saveCurrentFlow({ nodes: [], edges: [] });

        await waitFor(() => expect(postMock).toHaveBeenCalled());
        expect(savedBody().nodes).toEqual([]);
        expect(Object.prototype.hasOwnProperty.call(savedBody(), 'nodes')).toBe(true);
    });

    it('strips runtime state so a run never dirties what gets stored', async () => {
        useFlowsStore.setState({ currentFlowId: '1008888' });
        const { result } = renderHook(() => useFlows(), { wrapper: createWrapper() });

        await result.current.saveCurrentFlow({ nodes: [node('n01ab')] as never, edges: [] });

        await waitFor(() => expect(postMock).toHaveBeenCalled());
        const saved = savedBody().nodes[0] as Record<string, unknown>;
        expect(saved.config).toEqual({ value: 'v-n01ab' });
        for (const runtimeKey of ['state', 'status', 'inputData', 'outputData', 'executionStats']) {
            expect(saved).not.toHaveProperty(runtimeKey);
        }
    });

    it('accepts the UI-side `connections` alias for edges', async () => {
        useFlowsStore.setState({ currentFlowId: '1008888' });
        const { result } = renderHook(() => useFlows(), { wrapper: createWrapper() });

        await result.current.saveCurrentFlow({
            nodes: [node('n01ab'), node('n02cd')] as never,
            connections: [edge('e01xy', 'n01ab', 'n02cd')] as never,
        });

        await waitFor(() => expect(postMock).toHaveBeenCalled());
        expect(savedBody().edges.map(e => e.id)).toEqual(['e01xy']);
    });

    it('creates the flow through /flows/0/save when there is no flow yet', async () => {
        const { result } = renderHook(() => useFlows(), { wrapper: createWrapper() });

        const outcome = await result.current.saveCurrentFlow({ nodes: [node('n01ab')] as never, edges: [] });

        await waitFor(() => expect(postMock).toHaveBeenCalled());
        expect(savedPath()).toBe('/flows/0/save');
        expect(outcome).toEqual({ success: true, id: '1009999', structureDropped: false });
        expect(savedBody().nodes.map(n => n.id)).toEqual(['n01ab']);
    });
});
