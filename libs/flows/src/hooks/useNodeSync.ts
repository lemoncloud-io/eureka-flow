import { useCallback, useEffect, useRef } from 'react';

import { useCreateNodeMutation, useUpsertNodeMutation } from './queries/useNodesQuery';

import type { NodeView } from '../types';

const DEBOUNCE_MS = 500;
const FLUSH_MAX_WAIT_MS = 5000;
const FLUSH_POLL_INTERVAL_MS = 50;
const TEMP_ID_PREFIX = 'temp_';

/** Check if an ID is a temporary ID (not yet assigned by server) */
const isTempId = (id: string): boolean => id.startsWith(TEMP_ID_PREFIX);

/** Callback invoked when server assigns a real ID to replace temp ID */
export type OnNodeIdAssigned = (tempId: string, serverId: string) => void;

interface UseNodeSyncOptions {
    /** Flow ID for creating new nodes */
    flowId: string | null;
}

interface UseNodeSyncReturn {
    /** Sync node updates to backend (debounced) */
    syncNodeUpdate: (nodeId: string, updates: Partial<NodeView>) => void;

    /**
     * Create a new node on backend with server-assigned ID
     * POST /nodes/0/upsert?flowId=:flowId (id="0" for server to assign ID)
     *
     * @param tempId - Temporary ID used in UI (will be replaced by server ID)
     * @param node - Node data to create
     * @param onIdAssigned - Callback when server assigns real ID
     */
    createNodeAsync: (
        tempId: string,
        node: {
            type: string;
            position: { x: number; y: number };
            config: Record<string, unknown>;
            customLabel?: string;
            description?: string;
            autoExecutionEnabled?: boolean;
        },
        onIdAssigned: OnNodeIdAssigned
    ) => void;

    /**
     * @deprecated Use createNodeAsync instead for server-assigned IDs
     * Create a new node on backend with client-provided ID
     */
    createNodeOnBackend: (node: {
        id: string;
        type: string;
        position: { x: number; y: number };
        config: Record<string, unknown>;
    }) => void;

    /** Flush all pending updates immediately (call before run) */
    flushPendingUpdates: () => Promise<void>;

    /** Check if any sync is pending */
    isPending: boolean;

    /** Set of temp IDs waiting for server response */
    pendingNodeIds: Set<string>;

    /**
     * Wait for a specific temp ID to be resolved to server ID
     * Returns the server ID when available
     */
    waitForNodeId: (tempId: string) => Promise<string>;
}

/**
 * Hook for syncing node changes to backend
 *
 * Features:
 * - Debounced updates (500ms) to prevent excessive API calls
 * - Per-node debounce timers (changes to different nodes don't interfere)
 * - Automatic cleanup on unmount
 * - Server-assigned ID support with callback pattern
 * - Uses unified upsert endpoint (POST /nodes/:id/upsert)
 *
 * Usage:
 * ```tsx
 * const { syncNodeUpdate, createNodeAsync } = useNodeSync({ flowId });
 *
 * // On new node with server-assigned ID
 * const tempId = generateTempId('node');
 * setNodes([...nodes, { id: tempId, ... }]); // Optimistic update
 * createNodeAsync(tempId, nodeData, (tempId, serverId) => {
 *     replaceNodeId(tempId, serverId); // Replace in state
 * });
 *
 * // On config change
 * handleConfigChange(nodeId, key, value);
 * syncNodeUpdate(nodeId, { config: newConfig });
 * ```
 */
export const useNodeSync = ({ flowId }: UseNodeSyncOptions): UseNodeSyncReturn => {
    const upsertMutation = useUpsertNodeMutation();
    const createMutation = useCreateNodeMutation();

    // Per-node debounce timers
    const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    // Pending updates per node (accumulated during debounce)
    const pendingUpdates = useRef<Map<string, Partial<NodeView>>>(new Map());

    // Track pending temp IDs waiting for server response
    const pendingNodeIdsRef = useRef<Set<string>>(new Set());

    // Map of tempId -> Promise resolve/reject (for waitForNodeId)
    const pendingResolvers = useRef<
        Map<string, { resolve: (serverId: string) => void; reject: (error: Error) => void }>
    >(new Map());

    // Cleanup debounce timers on unmount
    useEffect(() => {
        return () => {
            debounceTimers.current.forEach(timer => clearTimeout(timer));
            debounceTimers.current.clear();
        };
    }, []);

    /**
     * Sync node updates to backend with debouncing
     * Multiple rapid updates to the same node are merged and sent once
     * Uses POST /nodes/:id/upsert endpoint
     */
    const syncNodeUpdate = useCallback(
        (nodeId: string, updates: Partial<NodeView>) => {
            if (!flowId) {
                console.warn('[useNodeSync] Cannot sync node: flowId is null');
                return;
            }

            // Skip if this is a temp ID that hasn't been resolved yet
            // Updates will be synced after ID is assigned
            if (isTempId(nodeId)) {
                console.debug('[useNodeSync] Skipping sync for temp ID:', nodeId);
                return;
            }

            // Merge with any pending updates for this node
            const existing = pendingUpdates.current.get(nodeId) || {};
            const merged = { ...existing, ...updates };
            pendingUpdates.current.set(nodeId, merged);

            // Clear existing timer for this node
            const existingTimer = debounceTimers.current.get(nodeId);
            if (existingTimer) {
                clearTimeout(existingTimer);
            }

            // Set new debounce timer
            const timer = setTimeout(() => {
                const finalUpdates = pendingUpdates.current.get(nodeId);
                if (finalUpdates && Object.keys(finalUpdates).length > 0) {
                    upsertMutation.mutate({ id: nodeId, flowId, body: finalUpdates });
                    pendingUpdates.current.delete(nodeId);
                }
                debounceTimers.current.delete(nodeId);
            }, DEBOUNCE_MS);

            debounceTimers.current.set(nodeId, timer);
        },
        [upsertMutation, flowId]
    );

    /**
     * Create a new node on backend with server-assigned ID
     * POST /nodes/0/upsert?flowId=:flowId
     *
     * Uses optimistic UI pattern:
     * 1. UI uses tempId immediately
     * 2. Server assigns real ID
     * 3. Callback replaces tempId with real ID in UI state
     */
    const createNodeAsync = useCallback(
        (
            tempId: string,
            node: {
                type: string;
                position: { x: number; y: number };
                config: Record<string, unknown>;
                customLabel?: string;
                description?: string;
                autoExecutionEnabled?: boolean;
            },
            onIdAssigned: OnNodeIdAssigned
        ) => {
            if (!flowId) {
                console.warn('[useNodeSync] Cannot create node: flowId is null');
                return;
            }

            // Track pending temp ID
            pendingNodeIdsRef.current.add(tempId);

            const body: Partial<NodeView> = {
                // blockId is the block's id (e.g., "0008")
                // Server uses blockId to look up block and derive processType
                blockId: node.type,
                position: node.position,
                config: node.config,
                customLabel: node.customLabel,
                description: node.description,
                autoExecutionEnabled: node.autoExecutionEnabled,
            };

            // Use id="0" to let server assign ID
            createMutation.mutate(
                { flowId, body },
                {
                    onSuccess: result => {
                        // Extract server-assigned ID from response
                        const createdNode = result.nodes?.[0];
                        if (createdNode?.id) {
                            const serverId = createdNode.id;
                            console.log('[useNodeSync] Node created with server ID:', { tempId, serverId });

                            // Remove from pending
                            pendingNodeIdsRef.current.delete(tempId);

                            // Resolve any waiting promises
                            const pending = pendingResolvers.current.get(tempId);
                            if (pending) {
                                pending.resolve(serverId);
                                pendingResolvers.current.delete(tempId);
                            }

                            // Callback to replace temp ID in UI
                            onIdAssigned(tempId, serverId);
                        } else {
                            console.error('[useNodeSync] Server did not return node ID', result);
                            pendingNodeIdsRef.current.delete(tempId);

                            // Reject waiting promises
                            const pending = pendingResolvers.current.get(tempId);
                            if (pending) {
                                pending.reject(new Error('Server did not return node ID'));
                                pendingResolvers.current.delete(tempId);
                            }
                        }
                    },
                    onError: error => {
                        console.error('[useNodeSync] Failed to create node:', tempId, error);
                        pendingNodeIdsRef.current.delete(tempId);

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
     * @deprecated Use createNodeAsync instead for server-assigned IDs
     * Create a new node on backend via upsert (no debounce)
     * POST /nodes/:id/upsert - creates if not exists, updates if exists
     */
    const createNodeOnBackend = useCallback(
        (node: { id: string; type: string; position: { x: number; y: number }; config: Record<string, unknown> }) => {
            if (!flowId) {
                console.warn('[useNodeSync] Cannot create node: flowId is null');
                return;
            }

            const body: Partial<NodeView> = {
                name: node.id,
                blockId: node.type,
                position: node.position,
                config: node.config,
            };

            upsertMutation.mutate({ id: node.id, flowId, body });
        },
        [flowId, upsertMutation]
    );

    /**
     * Wait for a specific temp ID to be resolved to server ID
     * Returns a promise that resolves with the server ID, or rejects on error
     */
    const waitForNodeId = useCallback((tempId: string): Promise<string> => {
        // If not pending, it might already be resolved or never existed
        if (!pendingNodeIdsRef.current.has(tempId)) {
            // Return immediately - assume it's already a real ID
            return Promise.resolve(tempId);
        }

        // Create a promise that will be resolved/rejected when the ID is assigned/fails
        return new Promise((resolve, reject) => {
            pendingResolvers.current.set(tempId, { resolve, reject });
        });
    }, []);

    /**
     * Flush all pending updates immediately and wait for in-flight mutations
     * Call this before executing nodes to ensure all config changes are saved
     */
    const flushPendingUpdates = useCallback(async (): Promise<void> => {
        if (!flowId) {
            return;
        }

        // Cancel all debounce timers
        debounceTimers.current.forEach(timer => clearTimeout(timer));
        debounceTimers.current.clear();

        // Collect all pending updates (only for non-temp IDs)
        const updates = Array.from(pendingUpdates.current.entries()).filter(([nodeId]) => !isTempId(nodeId));
        pendingUpdates.current.clear();

        // Execute pending updates
        if (updates.length > 0) {
            console.log('[useNodeSync] Flushing pending updates:', updates.length);

            const promises = updates.map(([nodeId, body]) => {
                return new Promise<void>((resolve, reject) => {
                    upsertMutation.mutate(
                        { id: nodeId, flowId, body },
                        {
                            onSuccess: () => resolve(),
                            onError: error => reject(error),
                        }
                    );
                });
            });

            await Promise.all(promises).catch(error => {
                console.error('[useNodeSync] Flush failed:', error);
                throw error;
            });
        }

        // Wait for any pending node creations to complete
        if (pendingNodeIdsRef.current.size > 0) {
            console.log('[useNodeSync] Waiting for pending node creations:', pendingNodeIdsRef.current.size);
            const pendingPromises = Array.from(pendingNodeIdsRef.current).map(tempId => waitForNodeId(tempId));
            await Promise.all(pendingPromises);
        }

        // Wait for any in-flight mutation to complete
        // Poll isPending until it becomes false
        let waited = 0;
        let loggedWaiting = false;

        while ((upsertMutation.isPending || createMutation.isPending) && waited < FLUSH_MAX_WAIT_MS) {
            if (!loggedWaiting) {
                console.log('[useNodeSync] Waiting for in-flight mutation...');
                loggedWaiting = true;
            }
            await new Promise(resolve => setTimeout(resolve, FLUSH_POLL_INTERVAL_MS));
            waited += FLUSH_POLL_INTERVAL_MS;
        }

        if (loggedWaiting && waited < FLUSH_MAX_WAIT_MS) {
            console.log('[useNodeSync] In-flight mutation completed');
        }
    }, [flowId, upsertMutation, createMutation, waitForNodeId]);

    return {
        syncNodeUpdate,
        createNodeAsync,
        createNodeOnBackend,
        flushPendingUpdates,
        isPending: upsertMutation.isPending || createMutation.isPending,
        pendingNodeIds: pendingNodeIdsRef.current,
        waitForNodeId,
    };
};
