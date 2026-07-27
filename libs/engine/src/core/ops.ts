import { wouldCreateCycle } from './cycle';
import { arePortTypesCompatible } from './edges';
import { newEdgeId, newNodeId } from './ids';

import type { FlowDocument } from './document';
import type { BlockDefinitionWithFrontend, GraphNode } from '../types';
import type { NodeData, Position } from '@lemoncloud/eureka-flows-api';

export type EngineErrorCode = 'CYCLE' | 'DUPLICATE_EDGE' | 'INCOMPATIBLE_PORTS' | 'NODE_NOT_FOUND';

/** A refused edit. Thrown, not returned, so a bad edit cannot be half-applied by accident. */
export class EngineError extends Error {
    readonly code: EngineErrorCode;

    constructor(code: EngineErrorCode, message: string) {
        super(message);
        this.name = 'EngineError';
        this.code = code;
    }
}

export interface AddNodeInput {
    type: string;
    position: Position;
    /** Block defaults belong to the caller — the engine does not read the registry for them. */
    config?: Record<string, unknown>;
    customLabel?: string;
}

export interface ConnectInput {
    sourceNodeId: string;
    sourcePortId: string;
    targetNodeId: string;
    targetPortId: string;
}

/** Every structural change to the graph. Only reachable inside `transact`. */
export interface GraphOps {
    addNode: (input: AddNodeInput) => string;
    updateNode: (id: string, patch: Partial<NodeData>) => void;
    removeNodes: (ids: string[]) => void;
    connect: (input: ConnectInput) => string;
    disconnect: (edgeIds: string[]) => void;
}

export interface OpsDeps {
    /**
     * Port definitions, read on demand so `connect` can refuse mismatched types.
     *
     * A getter rather than a value: the registry loads over the network, and an engine
     * built before it arrives would otherwise skip the check for the rest of the session.
     * Omit it and `INCOMPATIBLE_PORTS` is simply never raised.
     */
    getBlockRegistry?: () => Record<string, BlockDefinitionWithFrontend>;
}

const portType = (
    registry: Record<string, BlockDefinitionWithFrontend> | undefined,
    node: NodeData,
    portId: string,
    direction: 'inputs' | 'outputs'
): string | undefined => registry?.[node.type]?.[direction]?.find(port => port.id === portId)?.type;

/**
 * Build the ops for one transaction.
 *
 * Returned with a `retire` so the engine can kill them once `fn` has returned: ops held
 * past the end of their transaction would write to the graph with no checkpoint recorded,
 * which is exactly the un-undoable edit the transaction boundary exists to prevent.
 */
export const createOps = (doc: FlowDocument, deps: OpsDeps = {}): { ops: GraphOps; retire: () => void } => {
    let live = true;

    const guard = (): void => {
        if (!live) throw new Error('GraphOps used outside the transact() call that created them');
    };

    const requireNode = (id: string): NodeData => {
        const node = doc.nodes().find(n => n.id === id);
        if (!node) throw new EngineError('NODE_NOT_FOUND', `No node with id ${id}`);
        return node;
    };

    const ops: GraphOps = {
        addNode: ({ type, position, config, customLabel }) => {
            guard();
            const id = newNodeId();
            const node = {
                id,
                type,
                position,
                config: config ? structuredClone(config) : {},
                state: 'IDLE',
                status: 'IDLE', // Deprecated: kept for backward compatibility
                inputData: {},
                outputData: {},
                autoExecutionEnabled: true,
                ...(customLabel ? { customLabel } : {}),
            } as GraphNode;

            doc.replace({ nodes: [...doc.nodes(), node], edges: doc.edges() });
            return id;
        },

        updateNode: (id, patch) => {
            guard();
            requireNode(id);
            doc.replace({
                nodes: doc.nodes().map(n => (n.id === id ? { ...n, ...patch } : n)),
                edges: doc.edges(),
            });
        },

        removeNodes: ids => {
            guard();
            const doomed = new Set(ids);
            // An edge with no node at one end is not a graph the server can store, so the
            // incident edges go with the nodes rather than waiting to be noticed.
            doc.replace({
                nodes: doc.nodes().filter(n => !n.id || !doomed.has(n.id)),
                edges: doc.edges().filter(e => !doomed.has(e.sourceNodeId) && !doomed.has(e.targetNodeId)),
            });
        },

        connect: ({ sourceNodeId, sourcePortId, targetNodeId, targetPortId }) => {
            guard();
            const source = requireNode(sourceNodeId);
            const target = requireNode(targetNodeId);
            const edges = doc.edges();

            const alreadyThere = edges.some(
                e =>
                    e.sourceNodeId === sourceNodeId &&
                    e.sourcePortId === sourcePortId &&
                    e.targetNodeId === targetNodeId &&
                    e.targetPortId === targetPortId
            );
            if (alreadyThere) throw new EngineError('DUPLICATE_EDGE', 'That connection already exists');

            if (wouldCreateCycle(edges, sourceNodeId, targetNodeId)) {
                throw new EngineError('CYCLE', 'That connection would close a loop');
            }

            const registry = deps.getBlockRegistry?.();
            const sourceType = portType(registry, source, sourcePortId, 'outputs');
            if (sourceType && !arePortTypesCompatible(sourceType, portType(registry, target, targetPortId, 'inputs'))) {
                throw new EngineError('INCOMPATIBLE_PORTS', 'Those ports carry different types');
            }

            const id = newEdgeId();
            // An input port holds one edge: connecting a second source to it replaces the
            // first rather than stacking, which is what the canvas has always done.
            const kept = edges.filter(e => !(e.targetNodeId === targetNodeId && e.targetPortId === targetPortId));
            doc.replace({
                nodes: doc.nodes(),
                edges: [...kept, { id, sourceNodeId, sourcePortId, targetNodeId, targetPortId }],
            });
            return id;
        },

        disconnect: edgeIds => {
            guard();
            const doomed = new Set(edgeIds);
            doc.replace({ nodes: doc.nodes(), edges: doc.edges().filter(e => !e.id || !doomed.has(e.id)) });
        },
    };

    return {
        ops,
        retire: () => {
            live = false;
        },
    };
};
