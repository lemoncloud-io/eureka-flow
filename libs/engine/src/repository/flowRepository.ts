import { captureBaseline, diffAgainstBaseline, rebaseline } from '../persistence/baseline';
import { emptySnapshot, toSnapshot } from '../persistence/snapshot';

import type { FlowEngine } from '../engine';
import type { WorkspaceContext } from '../persistence/baseline';
import type { FlowSnapshot } from '../persistence/snapshot';
import type { HttpPort } from '../ports/http';
import type { BlockDefinitionWithFrontend } from '../types';
import type { EdgeData, NodeData } from '@lemoncloud/eureka-flows-api';

/** `GET /flows/:id/load`, reduced to the parts the graph cares about. */
interface LoadFlowResponse {
    id?: string;
    nodes?: NodeData[];
    edges?: EdgeData[];
    /** Older flows name the same field `connections`. */
    connections?: EdgeData[];
    /** Owner, or same-workspace editor. Decides whether a structural save survives. */
    isEditable?: boolean;
    hasOwned?: boolean;
}

/** `POST /flows/:id/save`. A new flow comes back with the id the server minted. */
interface SaveFlowResponse {
    id?: string;
}

export interface SaveOutcome {
    /** The flow's id. A flow saved as '0' gets a real one here. */
    flowId: string;
    /**
     * True when the save answered 200 and the server dropped the structure anyway — the
     * only signal a non-owner editor gets that their added nodes went nowhere.
     */
    structureDropped: boolean;
}

export interface FlowRepository {
    /** Block definitions, fetched once and cached. */
    loadBlocks: () => Promise<Record<string, BlockDefinitionWithFrontend>>;
    blockRegistry: () => Record<string, BlockDefinitionWithFrontend>;
    /** Load a flow into the engine and take the baseline from it. */
    load: (flowId: string) => Promise<void>;
    /** Whether the graph holds work the server has not seen. */
    isDirty: () => boolean;
    /** Send the whole graph. Returns the flow id and whether the structure survived. */
    save: () => Promise<SaveOutcome>;
    /** What the server last confirmed, for callers that want to inspect it. */
    baseline: () => FlowSnapshot | null;
}

export interface FlowRepositoryOptions {
    engine: FlowEngine;
    http: HttpPort;
}

const byType = (blocks: BlockDefinitionWithFrontend[]): Record<string, BlockDefinitionWithFrontend> =>
    Object.fromEntries(blocks.map(block => [block.type, block]));

/**
 * The graph's relationship with the server.
 *
 * This owns the workspace context that used to live in `useFlowsStore` — baseline, block
 * registry, and who is editing. That is the whole point of having made those rules pure:
 * the same load/save semantics now hold in a CLI, where there is no store to read.
 */
export const createFlowRepository = ({ engine, http }: FlowRepositoryOptions): FlowRepository => {
    let blocks: Record<string, BlockDefinitionWithFrontend> = {};
    let blocksLoaded = false;
    let baseline: FlowSnapshot | null = null;
    let currentFlowId: string | null = null;
    let isEditable = true;
    let hasOwned = true;

    const context = (): WorkspaceContext => ({ blockRegistry: blocks, baseline, isEditable, hasOwned, currentFlowId });

    const loadBlocks = async (): Promise<Record<string, BlockDefinitionWithFrontend>> => {
        if (blocksLoaded) return blocks;
        const { data } = await http.request<BlockDefinitionWithFrontend[] | { list?: BlockDefinitionWithFrontend[] }>({
            method: 'GET',
            path: '/blocks/0/list',
        });
        blocks = byType(Array.isArray(data) ? data : (data?.list ?? []));
        blocksLoaded = true;
        return blocks;
    };

    return {
        loadBlocks,
        blockRegistry: () => blocks,
        baseline: () => baseline,

        load: async flowId => {
            // Blocks first, always. `toSnapshot` resolves each node's type through the
            // registry, so a baseline taken while it is empty disagrees with the working
            // copy on fields nobody touched — and the flow reads dirty from the moment it
            // opens. Making this a call-order rule instead of a structure invites the bug.
            await loadBlocks();

            const { data } = await http.request<LoadFlowResponse>({
                method: 'GET',
                path: `/flows/${encodeURIComponent(flowId)}/load`,
            });

            engine.loadGraph({ nodes: data.nodes ?? [], edges: data.edges ?? data.connections ?? [] });
            currentFlowId = data.id ?? flowId;
            isEditable = data.isEditable ?? true;
            hasOwned = data.hasOwned ?? true;
            // From the engine's normalized graph, never the raw response (invariant 7).
            baseline = captureBaseline(engine.getGraph(), blocks);
        },

        isDirty: () => !diffAgainstBaseline(engine.getGraph(), context()).isEmpty,

        save: async () => {
            // The whole graph, every time. Save is a replace: whatever this body leaves
            // out, the server deletes. There is no partial save to optimise into.
            const sent = toSnapshot(engine.getGraph(), blocks);

            const { data } = await http.request<SaveFlowResponse>({
                method: 'POST',
                path: `/flows/${encodeURIComponent(currentFlowId ?? '0')}/save`,
                body: { nodes: sent.nodes, edges: sent.edges },
            });

            // Rebaseline off the snapshot that was *sent*, not the graph as it stands now:
            // the round trip is asynchronous, and edits made during it are still unsaved.
            const outcome = rebaseline(sent, context());
            if (outcome.baseline) baseline = outcome.baseline;

            currentFlowId = data.id ?? currentFlowId ?? '0';
            return { flowId: currentFlowId, structureDropped: outcome.dropped };
        },
    };
};

/** An empty baseline, for a caller that wants to compare against "the server has nothing". */
export const noBaseline = emptySnapshot;
