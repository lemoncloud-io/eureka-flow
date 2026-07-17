import { beforeEach, describe, expect, it } from 'vitest';

import {
    baselineForRecovery,
    captureBaseline,
    draftFor,
    draftHasUnsavedWork,
    toSnapshot,
    useFlowsStore,
} from '@flows/flows';

import type { BlockDefinitionWithFrontend, FlowDraft } from '@flows/flows';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

// Keyed by type, and also by id — the registry does both, because the load API hands back
// a node whose `type` is really a blockId. That second key is what `toSnapshot` resolves.
const registry = {
    'text-input': { type: 'text-input', inputs: [], outputs: [] },
    '1000006': { type: 'text-input', inputs: [], outputs: [] },
} as unknown as Record<string, BlockDefinitionWithFrontend>;

const node = (id: string, over: Partial<NodeData> = {}) =>
    ({ id, type: 'text-input', position: { x: 0, y: 0 }, config: {}, ...over }) as NodeData;

const snap = (nodes: NodeData[]) => toSnapshot({ nodes, connections: [] }, registry);

describe('draftFor', () => {
    beforeEach(() => {
        useFlowsStore.setState({ currentFlowId: '1008888', blockRegistry: registry, baseline: null });
        captureBaseline({ nodes: [node('n01')], connections: [] });
    });

    it('keeps nothing when the graph matches the server', () => {
        // A draft equal to the server is worse than none: the next boot would offer to
        // recover work that is already saved.
        expect(draftFor({ nodes: [node('n01')], connections: [] }, 1)).toBeNull();
    });

    it('keeps the working copy once it differs', () => {
        const draft = draftFor({ nodes: [node('n01'), node('n02')], connections: [] }, 42);

        expect(draft).toMatchObject({ flowId: '1008888', savedAt: 42 });
        expect(draft?.working.nodes.map(n => n.id)).toEqual(['n01', 'n02']);
    });

    it('keeps the baseline too — offline it is the only record of what the server had', () => {
        const draft = draftFor({ nodes: [node('n01'), node('n02')], connections: [] }, 1);

        expect(draft?.baseline?.nodes.map(n => n.id)).toEqual(['n01']);
    });

    it('keeps nothing for a run — status and port churn is not work', () => {
        const afterRun = {
            nodes: [node('n01', { state: 'COMPLETED', outputData: { out: { value: 'y' } } } as Partial<NodeData>)],
            connections: [],
        };

        expect(draftFor(afterRun as never, 1)).toBeNull();
    });

    it('marks a never-saved flow with a null id', () => {
        useFlowsStore.setState({ currentFlowId: null, baseline: null });

        expect(draftFor({ nodes: [node('n01')], connections: [] }, 1)?.flowId).toBeNull();
    });
});

describe('draftHasUnsavedWork', () => {
    const draft = (over: Partial<FlowDraft> = {}): FlowDraft => ({
        flowId: '1008888',
        working: snap([node('n01'), node('n02')]),
        baseline: snap([node('n01')]),
        savedAt: 1,
        ...over,
    });

    beforeEach(() => {
        useFlowsStore.setState({ currentFlowId: '1008888', blockRegistry: registry, baseline: null });
        captureBaseline({ nodes: [node('n01')], connections: [] });
    });

    it('offers a draft holding work the server does not have', () => {
        expect(draftHasUnsavedWork(draft(), '1008888')).toBe(true);
    });

    it('ignores a draft that matches the server', () => {
        expect(draftHasUnsavedWork(draft({ working: snap([node('n01')]) }), '1008888')).toBe(false);
    });

    it('ignores another flow’s draft', () => {
        expect(draftHasUnsavedWork(draft({ flowId: '1009999' }), '1008888')).toBe(false);
    });

    it('ignores a never-saved draft when a real flow is open', () => {
        // The tutorial drives the same canvas with no flow id. Its leftovers must never
        // surface inside someone's actual flow.
        expect(draftHasUnsavedWork(draft({ flowId: null }), '1008888')).toBe(false);
    });

    it('ignores nothing at all', () => {
        expect(draftHasUnsavedWork(null, '1008888')).toBe(false);
    });

    it('trusts the draft when the server was never reached', () => {
        // No baseline means this boot never loaded the flow, so the draft is all there is.
        useFlowsStore.setState({ baseline: null });

        expect(draftHasUnsavedWork(draft(), '1008888')).toBe(true);
    });
});

describe('baselineForRecovery', () => {
    const draft: FlowDraft = {
        flowId: '1008888',
        working: snap([node('n01'), node('n02')]),
        baseline: snap([node('n01', { customLabel: 'stale' })]),
        savedAt: 1,
    };

    beforeEach(() => {
        useFlowsStore.setState({ currentFlowId: '1008888', blockRegistry: registry, baseline: null });
    });

    it('prefers the baseline this boot loaded — the draft’s is as old as the draft', () => {
        // Taking the draft's would hide whatever another session changed while this tab
        // was away, and call the flow clean where it is not.
        captureBaseline({ nodes: [node('n01', { customLabel: 'renamed elsewhere' })], connections: [] });

        expect(baselineForRecovery(draft)?.nodes[0]).toMatchObject({ customLabel: 'renamed elsewhere' });
    });

    it('falls back to the draft’s when offline left us without one', () => {
        useFlowsStore.setState({ baseline: null });

        expect(baselineForRecovery(draft)?.nodes[0]).toMatchObject({ customLabel: 'stale' });
    });
});
