import { useCallback, useRef } from 'react';

import { useMutation } from '@tanstack/react-query';

import { upsertFlow } from '../api';

import type { EdgeData } from '@lemoncloud/eureka-flows-api';

/** Callback invoked when server assigns a real ID to replace temp ID */
export type OnEdgeIdAssigned = (tempId: string, serverId: string) => void;

interface UseEdgeSyncOptions {
    /** Flow ID for creating edges */
    flowId: string | null;
}

interface UseEdgeSyncReturn {
    /**
     * Create a new edge on backend with server-assigned ID
     * POST /flows/:flowId/upsert with { nodes: [], edges: [edge] }
     *
     * @param tempId - Temporary ID used in UI (will be replaced by server ID)
     * @param edge - Edge data to create (without id, or with temp id)
     * @param onIdAssigned - Callback when server assigns real ID
     */
    createEdgeAsync: (tempId: string, edge: Omit<EdgeData, 'id'>, onIdAssigned: OnEdgeIdAssigned) => void;

    /** Check if any edge creation is pending */
    isPending: boolean;

    /** Set of temp edge IDs waiting for server response */
    pendingEdgeIds: Set<string>;

    /**
     * Wait for a specific temp edge ID to be resolved to server ID
     * Returns the server ID when available
     */
    waitForEdgeId: (tempId: string) => Promise<string>;
}

/**
 * Hook for syncing edge (connection) creation to backend
 *
 * Features:
 * - Server-assigned ID support with callback pattern
 * - Optimistic UI: temp ID → server ID replacement
 * - Uses POST /flows/:id/upsert with edges array
 *
 * Usage:
 * ```tsx
 * const { createEdgeAsync } = useEdgeSync({ flowId });
 *
 * // On new edge with server-assigned ID
 * const tempId = generateTempId('edge');
 * setConnections([...connections, { id: tempId, ... }]); // Optimistic update
 * createEdgeAsync(tempId, edgeData, (tempId, serverId) => {
 *     replaceEdgeId(tempId, serverId); // Replace in state
 * });
 * ```
 */
export const useEdgeSync = ({ flowId }: UseEdgeSyncOptions): UseEdgeSyncReturn => {
    // Use upsertFlow mutation for POST /flows/:id/upsert
    const createMutation = useMutation({
        mutationFn: ({ flowId, edge }: { flowId: string; edge: EdgeData }) =>
            upsertFlow(flowId, { nodes: [], edges: [edge] }),
    });

    // Track pending temp edge IDs waiting for server response
    const pendingEdgeIdsRef = useRef<Set<string>>(new Set());

    // Map of tempId -> Promise resolve/reject (for waitForEdgeId)
    const pendingResolvers = useRef<
        Map<string, { resolve: (serverId: string) => void; reject: (error: Error) => void }>
    >(new Map());

    /**
     * Create a new edge on backend with server-assigned ID
     * POST /flows/:flowId/upsert with { nodes: [], edges: [edge] }
     */
    const createEdgeAsync = useCallback(
        (tempId: string, edge: Omit<EdgeData, 'id'>, onIdAssigned: OnEdgeIdAssigned) => {
            if (!flowId) {
                console.warn('[useEdgeSync] Cannot create edge: flowId is null');
                return;
            }

            // Track pending temp ID
            pendingEdgeIdsRef.current.add(tempId);

            // Prepare edge data for server (no id field, server will assign)
            const edgeData: EdgeData = {
                sourceNodeId: edge.sourceNodeId,
                sourcePortId: edge.sourcePortId,
                targetNodeId: edge.targetNodeId,
                targetPortId: edge.targetPortId,
            };

            createMutation.mutate(
                { flowId, edge: edgeData },
                {
                    onSuccess: result => {
                        // Extract server-assigned ID from response
                        const createdEdge = result.edges?.[0];
                        if (createdEdge?.id) {
                            const serverId = createdEdge.id;
                            console.log('[useEdgeSync] Edge created with server ID:', { tempId, serverId });

                            // Remove from pending
                            pendingEdgeIdsRef.current.delete(tempId);

                            // Resolve any waiting promises
                            const pending = pendingResolvers.current.get(tempId);
                            if (pending) {
                                pending.resolve(serverId);
                                pendingResolvers.current.delete(tempId);
                            }

                            // Callback to replace temp ID in UI
                            onIdAssigned(tempId, serverId);
                        } else {
                            console.error('[useEdgeSync] Server did not return edge ID', result);
                            pendingEdgeIdsRef.current.delete(tempId);

                            // Reject waiting promises
                            const pending = pendingResolvers.current.get(tempId);
                            if (pending) {
                                pending.reject(new Error('Server did not return edge ID'));
                                pendingResolvers.current.delete(tempId);
                            }
                        }
                    },
                    onError: error => {
                        console.error('[useEdgeSync] Failed to create edge:', tempId, error);
                        pendingEdgeIdsRef.current.delete(tempId);

                        // Reject any waiting promises
                        const pending = pendingResolvers.current.get(tempId);
                        if (pending) {
                            pending.reject(error instanceof Error ? error : new Error(String(error)));
                            pendingResolvers.current.delete(tempId);
                        }
                    },
                }
            );
        },
        [flowId, createMutation]
    );

    /**
     * Wait for a specific temp edge ID to be resolved to server ID
     * Returns a promise that resolves with the server ID, or rejects on error
     */
    const waitForEdgeId = useCallback((tempId: string): Promise<string> => {
        // If not pending, it might already be resolved or never existed
        if (!pendingEdgeIdsRef.current.has(tempId)) {
            // Return immediately - assume it's already a real ID
            return Promise.resolve(tempId);
        }

        // Create a promise that will be resolved/rejected when the ID is assigned/fails
        return new Promise((resolve, reject) => {
            pendingResolvers.current.set(tempId, { resolve, reject });
        });
    }, []);

    return {
        createEdgeAsync,
        isPending: createMutation.isPending,
        pendingEdgeIds: pendingEdgeIdsRef.current,
        waitForEdgeId,
    };
};
