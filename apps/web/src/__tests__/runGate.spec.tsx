import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { captureBaseline, runRequirement, useCanvasStore, useFlowsStore } from '@flows/flows';

import { useRunGate } from '../app/features/flows/hooks/useRunGate';

import type { BlockDefinitionWithFrontend, GraphNode } from '@flows/flows';
import type { ReactNode } from 'react';

const postMock = vi.fn();
const toastError = vi.fn();

vi.mock('@flows/web-core', () => ({
    API_URL: 'http://test',
    api: { post: (...args: unknown[]) => postMock(...args), get: vi.fn(), delete: vi.fn() },
    withRetry: (fn: () => unknown) => fn(),
}));

vi.mock('sonner', () => ({
    toast: { error: (...args: unknown[]) => toastError(...args), success: vi.fn(), info: vi.fn() },
}));

const createWrapper = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
};

const registry = {
    'text-input': { type: 'TEXT_INPUT', inputs: [], outputs: [] },
} as unknown as Record<string, BlockDefinitionWithFrontend>;

const node = (id: string, config: Record<string, string> = {}) =>
    ({ id, type: 'text-input', position: { x: 0, y: 0 }, config }) as GraphNode;

const asOwner = () => useFlowsStore.setState({ hasOwned: true, isEditable: true });
const asEditor = () => useFlowsStore.setState({ hasOwned: false, isEditable: true });

describe('runRequirement', () => {
    beforeEach(() => {
        useFlowsStore.setState({ currentFlowId: '1008888', blockRegistry: registry, baseline: null });
        asOwner();
        captureBaseline({ nodes: [node('n01')], connections: [] });
    });

    it('is ready when the server already has this graph', () => {
        expect(runRequirement({ nodes: [node('n01')], connections: [] })).toBe('ready');
    });

    it('needs a save once a node is added', () => {
        expect(runRequirement({ nodes: [node('n01'), node('n02')], connections: [] })).toBe('needs-save');
    });

    it('needs a save for an owner config edit', () => {
        expect(runRequirement({ nodes: [node('n01', { value: 'x' })], connections: [] })).toBe('needs-save');
    });

    it('needs a save for a non-owner editor config edit — the server keeps those', () => {
        asEditor();
        expect(runRequirement({ nodes: [node('n01', { value: 'x' })], connections: [] })).toBe('needs-save');
    });

    it('cannot be rescued by saving when a non-owner editor adds a node', () => {
        // Saving would answer 200 and store nothing of the structure, so the run would
        // still ask the server for a node it has never seen.
        asEditor();
        expect(runRequirement({ nodes: [node('n01'), node('n02')], connections: [] })).toBe('editor-structure');
    });
});

describe('useRunGate', () => {
    /** The gate reads the live canvas, so put the graph where it will look. */
    const onCanvas = (nodes: GraphNode[]) =>
        useCanvasStore.getState().loadWorkflow({ nodes, connections: [] } as never);

    beforeEach(() => {
        postMock.mockReset();
        toastError.mockReset();
        postMock.mockResolvedValue({ data: { id: '1008888' } });
        useFlowsStore.setState({ currentFlowId: '1008888', blockRegistry: registry, baseline: null });
        asOwner();
        captureBaseline({ nodes: [node('n01')], connections: [] });
        onCanvas([node('n01'), node('n02')]);
        vi.restoreAllMocks();
    });

    it('hands back the flow id for a clean graph, without saving', async () => {
        onCanvas([node('n01')]);
        const { result } = renderHook(() => useRunGate(), { wrapper: createWrapper() });

        await expect(result.current()).resolves.toBe('1008888');
        expect(postMock).not.toHaveBeenCalled();
    });

    it('saves the dirty flow, then hands back its id — no prompt', async () => {
        const { result } = renderHook(() => useRunGate(), { wrapper: createWrapper() });

        await expect(result.current()).resolves.toBe('1008888');
        expect(postMock).toHaveBeenCalledOnce();
    });

    it('hands back the id a brand-new flow just claimed, not the null it started with', async () => {
        // The save mints the id, and the store write behind it has not re-rendered anyone
        // yet — so a caller reading currentFlowId itself would get null and quietly skip
        // the run. This is the whole reason the gate returns it.
        useFlowsStore.setState({ currentFlowId: null, baseline: null });
        postMock.mockResolvedValue({ data: { id: '1009999' } });
        const { result } = renderHook(() => useRunGate(), { wrapper: createWrapper() });

        await expect(result.current()).resolves.toBe('1009999');
    });

    it('stops the run when the save fails', async () => {
        // Running anyway would hit the server with a node it never stored.
        postMock.mockRejectedValue(new Error('network down'));
        const { result } = renderHook(() => useRunGate(), { wrapper: createWrapper() });

        await expect(result.current()).resolves.toBeNull();
    });

    it('stops a non-owner editor without saving, and says why', async () => {
        asEditor();
        const { result } = renderHook(() => useRunGate(), { wrapper: createWrapper() });

        await expect(result.current()).resolves.toBeNull();
        expect(postMock).not.toHaveBeenCalled();
        expect(toastError).toHaveBeenCalledOnce();
    });
});
