import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    captureBaseline,
    diffAgainstBaseline,
    toSnapshot,
    useCanvasStore,
    useFlows,
    useFlowsStore,
} from '@flows/flows';

import type { BlockDefinitionWithFrontend, GraphNode } from '@flows/flows';
import type { ReactNode } from 'react';

const postMock = vi.fn();
const getMock = vi.fn();

vi.mock('@flows/web-core', () => ({
    API_URL: 'http://test',
    api: {
        post: (...args: unknown[]) => postMock(...args),
        get: (...args: unknown[]) => getMock(...args),
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

// The registry renames the block's type on the way into a snapshot — the same rewrite
// `toSnapshot` performs in production, and what makes the capture order below matter.
const registry = {
    'text-input': { type: 'TEXT_INPUT', inputs: [], outputs: [] },
} as unknown as Record<string, BlockDefinitionWithFrontend>;

/** A node as the server sends it: no config, no position. */
const rawNode = (id: string) => ({ id, type: 'text-input' }) as GraphNode;

/** The same node as the canvas holds it, once loadWorkflow has filled in the gaps. */
const normalizedNode = (id: string) => ({ ...rawNode(id), config: {}, position: { x: 0, y: 0 } }) as GraphNode;

describe('baseline capture', () => {
    beforeEach(() => {
        postMock.mockReset();
        getMock.mockReset();
        postMock.mockResolvedValue({ data: { id: '1009999' } });
        useFlowsStore.setState({ currentFlowId: null, blockRegistry: registry, baseline: null, hasOwned: true });
        localStorage.clear();
    });

    it('reads a just-loaded flow as clean — nothing touched, nothing to save', () => {
        const working = { nodes: [normalizedNode('n01')], connections: [] };

        captureBaseline(working);

        expect(diffAgainstBaseline(working).isEmpty).toBe(true);
    });

    it('reads dirty when the baseline comes from the raw response instead of the canvas', () => {
        // The trap this ordering exists to avoid: loadWorkflow fills in config and
        // position, so a baseline built from the response disagrees with the working copy
        // on fields nobody edited, and every load would trip auto-save.
        useFlowsStore.getState().setBaseline(toSnapshot({ nodes: [rawNode('n01')] }, registry));

        const diff = diffAgainstBaseline({ nodes: [normalizedNode('n01')], connections: [] });

        expect(diff.isEmpty).toBe(false);
        expect(diff.modifiedNodes).toEqual(['n01']);
    });

    it('reads dirty when the baseline is taken before blocks load', () => {
        // The registry resolves each node's type. Capture while it is still empty and the
        // baseline records the wrong type for every node in the flow.
        const working = { nodes: [normalizedNode('n01')], connections: [] };
        useFlowsStore.setState({ blockRegistry: {} });

        captureBaseline(working);
        useFlowsStore.setState({ blockRegistry: registry });

        expect(diffAgainstBaseline(working).modifiedNodes).toEqual(['n01']);
    });

    it('ignores a run — status and port data are not edits', () => {
        const working = { nodes: [normalizedNode('n01')], connections: [] };
        captureBaseline(working);

        const afterRun = {
            nodes: [{ ...normalizedNode('n01'), state: 'COMPLETED', outputData: { out: { value: 'y' } } }],
            connections: [],
        };

        expect(diffAgainstBaseline(afterRun as never).isEmpty).toBe(true);
    });
});

describe('re-baseline on save', () => {
    beforeEach(() => {
        postMock.mockReset();
        postMock.mockResolvedValue({ data: { id: '1009999' } });
        useFlowsStore.setState({
            currentFlowId: '1008888',
            blockRegistry: registry,
            baseline: null,
            hasOwned: true,
            isEditable: true,
        });
        localStorage.clear();
    });

    it('goes clean once the save lands', async () => {
        const working = { nodes: [normalizedNode('n01')], connections: [] };
        const { result } = renderHook(() => useFlows(), { wrapper: createWrapper() });

        expect(diffAgainstBaseline(working).isEmpty).toBe(false);
        await result.current.saveCurrentFlow(working);

        await waitFor(() => expect(postMock).toHaveBeenCalled());
        expect(diffAgainstBaseline(working).isEmpty).toBe(true);
    });

    it('keeps an edit made while the save was in flight', async () => {
        // The baseline is the snapshot that was sent. Read the canvas when the response
        // lands instead and anything typed during the round trip is marked saved, so it
        // vanishes from the next diff and never reaches the server.
        let release: (value: unknown) => void = () => undefined;
        postMock.mockReturnValue(new Promise(resolve => (release = resolve)));
        const { result } = renderHook(() => useFlows(), { wrapper: createWrapper() });

        const sent = { nodes: [normalizedNode('n01')], connections: [] };
        const saving = result.current.saveCurrentFlow(sent);

        // The user adds a node mid-flight, so the canvas now holds more than was sent.
        // Anything re-reading the canvas here would swallow n02.
        useCanvasStore.getState().loadWorkflow({
            nodes: [normalizedNode('n01'), normalizedNode('n02')],
            connections: [],
        } as never);
        release({ data: { id: '1008888' } });
        await saving;

        const { nodes, connections } = useCanvasStore.getState();
        expect(diffAgainstBaseline({ nodes, connections }).addedNodes).toEqual(['n02']);
    });

    it('declines the baseline when the server drops a non-owner editor’s structure', async () => {
        // The server keeps an editor's config overlay and silently discards added nodes,
        // so a 200 does not mean the graph was stored. Reading clean here would strand the
        // node in this tab alone.
        useFlowsStore.setState({ hasOwned: false, isEditable: true });
        useFlowsStore.getState().setBaseline(toSnapshot({ nodes: [normalizedNode('n01')] }, registry));

        const withNewNode = { nodes: [normalizedNode('n01'), normalizedNode('n02')], connections: [] };
        const { result } = renderHook(() => useFlows(), { wrapper: createWrapper() });
        await result.current.saveCurrentFlow(withNewNode);

        await waitFor(() => expect(postMock).toHaveBeenCalled());
        expect(diffAgainstBaseline(withNewNode).addedNodes).toEqual(['n02']);
    });

    it('takes the baseline for a non-owner editor’s config edit — the server does keep those', async () => {
        useFlowsStore.setState({ hasOwned: false, isEditable: true });
        useFlowsStore.getState().setBaseline(toSnapshot({ nodes: [normalizedNode('n01')] }, registry));

        const withNewConfig = {
            nodes: [{ ...normalizedNode('n01'), config: { value: 'edited' } }],
            connections: [],
        };
        const { result } = renderHook(() => useFlows(), { wrapper: createWrapper() });
        await result.current.saveCurrentFlow(withNewConfig as never);

        await waitFor(() => expect(postMock).toHaveBeenCalled());
        expect(diffAgainstBaseline(withNewConfig as never).isEmpty).toBe(true);
    });
});

describe('lazy flow creation', () => {
    beforeEach(() => {
        postMock.mockReset();
        getMock.mockReset();
        postMock.mockResolvedValue({ data: { id: '1009999' } });
        useFlowsStore.setState({ currentFlowId: null, blockRegistry: registry, baseline: null });
        useCanvasStore.getState().clearWorkflow();
        localStorage.clear();
    });

    it('starts a new flow without touching the network', async () => {
        const { result } = renderHook(() => useFlows(), { wrapper: createWrapper() });

        const outcome = await result.current.initializeFlow();

        expect(outcome).toEqual({ flowId: null, flowData: null, isNew: true });
        expect(postMock).not.toHaveBeenCalled();
        expect(getMock).not.toHaveBeenCalled();
    });

    it('reads clean on a fresh flow, so an untouched canvas never auto-saves', async () => {
        const { result } = renderHook(() => useFlows(), { wrapper: createWrapper() });

        await result.current.initializeFlow();

        expect(diffAgainstBaseline({ nodes: [], connections: [] }).isEmpty).toBe(true);
    });

    it('claims an id from the first save', async () => {
        const { result } = renderHook(() => useFlows(), { wrapper: createWrapper() });
        await result.current.initializeFlow();

        const outcome = await result.current.saveCurrentFlow({ nodes: [normalizedNode('n01')], connections: [] });

        await waitFor(() => expect(postMock).toHaveBeenCalled());
        expect(postMock.mock.calls.at(-1)?.[0]).toBe('/flows/0/save');
        expect(outcome).toEqual({ success: true, id: '1009999', structureDropped: false });
    });
});
