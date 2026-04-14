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
    /** When true, all sync operations are no-ops (guest mode) */
    disabled?: boolean;
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

    /** Get the last synced config. undefined means no local upsert tracked (e.g., loaded from server). */
    getSyncedConfig: (nodeId: string) => Record<string, string> | undefined;
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
export const useNodeSync = ({ flowId, disabled }: UseNodeSyncOptions): UseNodeSyncReturn => {
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

    // Map of tempId -> serverId (for already resolved IDs)
    const resolvedIdsRef = useRef<Map<string, string>>(new Map());

    // Track last successfully synced config per node (for skip-if-unchanged optimization)
    const syncedConfigRef = useRef<Map<string, Record<string, string>>>(new Map());

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            debounceTimers.current.forEach(timer => clearTimeout(timer));
            debounceTimers.current.clear();
            pendingUpdates.current.clear();
            pendingNodeIdsRef.current.clear();
            pendingResolvers.current.clear();
            resolvedIdsRef.current.clear();
            syncedConfigRef.current.clear();
        };
    }, []);

    // Clear synced config when flow changes to prevent stale data across flows
    useEffect(() => {
        syncedConfigRef.current.clear();
    }, [flowId]);

    /**
     * Sync node updates to backend with debouncing
     * Multiple rapid updates to the same node are merged and sent once
     * Uses POST /nodes/:id/upsert endpoint
     */
    const syncNodeUpdate = useCallback(
        (nodeId: string, updates: Partial<NodeView>) => {
            if (disabled) return;
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
                    // Cast: NodeView lacks `config` but API uses Record<string, string> (see NodeData.config)
                    const configSnapshot = finalUpdates.config
                        ? (finalUpdates.config as Record<string, string>)
                        : undefined;
                    upsertMutation.mutate(
                        { id: nodeId, flowId, body: finalUpdates },
                        {
                            onSuccess: () => {
                                if (configSnapshot) {
                                    syncedConfigRef.current.set(nodeId, configSnapshot);
                                }
                            },
                        }
                    );
                    pendingUpdates.current.delete(nodeId);
                }
                debounceTimers.current.delete(nodeId);
            }, DEBOUNCE_MS);

            debounceTimers.current.set(nodeId, timer);
        },
        [disabled, upsertMutation, flowId]
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
            if (disabled) return;
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
                        // Support multiple response formats:
                        // 1. Direct node object: { id: '...', type: '...', ... }
                        // 2. nodes array: { nodes: [{ id: '...', ... }] }
                        // 3. nodes$$ array (deprecated): { nodes$$: [{ id: '...', ... }] }
                        const resultAny = result as Record<string, unknown>;
                        const createdNode =
                            (resultAny.id ? (result as unknown as { id: string }) : null) ??
                            result.nodes?.[0] ??
                            (resultAny['nodes$$'] as typeof result.nodes)?.[0];

                        console.debug('[useNodeSync] API response:', { tempId, result, createdNode });

                        if (createdNode?.id) {
                            const serverId = createdNode.id;
                            console.log('[useNodeSync] Node created with server ID:', { tempId, serverId });

                            // Store mapping for future lookups
                            resolvedIdsRef.current.set(tempId, serverId);

                            // Store synced config for the new server ID
                            if (node.config && Object.keys(node.config).length > 0) {
                                syncedConfigRef.current.set(serverId, node.config as Record<string, string>);
                            }

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
        [disabled, flowId, createMutation]
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
        // Check if already resolved (ID mapping exists)
        const resolvedId = resolvedIdsRef.current.get(tempId);
        if (resolvedId) {
            console.debug('[useNodeSync] waitForNodeId: already resolved', { tempId, resolvedId });
            return Promise.resolve(resolvedId);
        }

        // If not pending, it might already be resolved or never existed
        if (!pendingNodeIdsRef.current.has(tempId)) {
            // Return immediately - assume it's already a real ID (not a temp ID)
            console.debug('[useNodeSync] waitForNodeId: not pending, returning as-is', { tempId });
            return Promise.resolve(tempId);
        }

        // Create a promise that will be resolved/rejected when the ID is assigned/fails
        console.debug('[useNodeSync] waitForNodeId: waiting for resolution', { tempId });
        return new Promise((resolve, reject) => {
            pendingResolvers.current.set(tempId, { resolve, reject });
        });
    }, []);

    /**
     * Flush all pending updates immediately and wait for in-flight mutations
     * Call this before executing nodes to ensure all config changes are saved
     */
    const flushPendingUpdates = useCallback(async (): Promise<void> => {
        if (disabled || !flowId) {
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
                const configSnapshot = body.config ? (body.config as Record<string, string>) : undefined;
                return new Promise<void>((resolve, reject) => {
                    upsertMutation.mutate(
                        { id: nodeId, flowId, body },
                        {
                            onSuccess: () => {
                                if (configSnapshot) {
                                    syncedConfigRef.current.set(nodeId, configSnapshot);
                                }
                                resolve();
                            },
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
    }, [disabled, flowId, upsertMutation, createMutation, waitForNodeId]);

    // useCallback with [] deps: stable reference needed for executeNode's dependency array
    const getSyncedConfig = useCallback(
        (nodeId: string): Record<string, string> | undefined => syncedConfigRef.current.get(nodeId),
        []
    );

    return {
        syncNodeUpdate,
        createNodeAsync,
        createNodeOnBackend,
        flushPendingUpdates,
        isPending: upsertMutation.isPending || createMutation.isPending,
        pendingNodeIds: pendingNodeIdsRef.current,
        waitForNodeId,
        getSyncedConfig,
    };
};
