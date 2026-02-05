import { useCallback, useEffect, useRef } from 'react';

import { useUpdateNodeMutation } from './queries/useNodesQuery';

import type { NodeView } from '../types';

const DEBOUNCE_MS = 500;

interface UseNodeSyncOptions {
    /** Flow ID for creating new nodes */
    flowId: string | null;
}

interface UseNodeSyncReturn {
    /** Sync node updates to backend (debounced) */
    syncNodeUpdate: (nodeId: string, updates: Partial<NodeView>) => void;
    /** Create a new node on backend */
    createNodeOnBackend: (node: {
        id: string;
        type: string;
        position: { x: number; y: number };
        config: Record<string, unknown>;
    }) => void;
    /** Check if any sync is pending */
    isPending: boolean;
}

/**
 * Hook for syncing node changes to backend
 *
 * Features:
 * - Debounced updates (500ms) to prevent excessive API calls
 * - Per-node debounce timers (changes to different nodes don't interfere)
 * - Automatic cleanup on unmount
 *
 * Usage:
 * ```tsx
 * const { syncNodeUpdate, createNodeOnBackend } = useNodeSync({ flowId });
 *
 * // On config change
 * handleConfigChange(nodeId, key, value);
 * syncNodeUpdate(nodeId, { config: newConfig });
 *
 * // On new node
 * createNodeOnBackend(newNode);
 * ```
 */
export const useNodeSync = ({ flowId }: UseNodeSyncOptions): UseNodeSyncReturn => {
    const updateMutation = useUpdateNodeMutation();

    // Per-node debounce timers
    const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    // Pending updates per node (accumulated during debounce)
    const pendingUpdates = useRef<Map<string, Partial<NodeView>>>(new Map());

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
     */
    const syncNodeUpdate = useCallback(
        (nodeId: string, updates: Partial<NodeView>) => {
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
                    updateMutation.mutate({ id: nodeId, body: finalUpdates });
                    pendingUpdates.current.delete(nodeId);
                }
                debounceTimers.current.delete(nodeId);
            }, DEBOUNCE_MS);

            debounceTimers.current.set(nodeId, timer);
        },
        [updateMutation]
    );

    /**
     * Create a new node on backend via PUT (no debounce)
     * PUT /nodes/:id - creates if not exists, updates if exists
     */
    const createNodeOnBackend = useCallback(
        (node: { id: string; type: string; position: { x: number; y: number }; config: Record<string, unknown> }) => {
            if (!flowId) {
                console.warn('[useNodeSync] Cannot create node: flowId is null');
                return;
            }

            const body: Partial<NodeView> = {
                name: node.id,
                flowId,
                blockId: node.type,
                position: node.position,
                config: node.config,
            };

            updateMutation.mutate({ id: node.id, body });
        },
        [flowId, updateMutation]
    );

    return {
        syncNodeUpdate,
        createNodeOnBackend,
        isPending: updateMutation.isPending,
    };
};
