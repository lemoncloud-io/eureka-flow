import { useCallback, useRef } from 'react';

import { useCanvasStore } from '../stores';

import type { WorkflowState } from '@lemoncloud/eureka-flows-api';

interface UseCanvasHistoryOptions {
    readOnly?: boolean;
}

/**
 * Hook for managing canvas undo/redo history
 *
 * Maintains a stack of workflow states for undo/redo operations.
 * Uses refs to avoid re-renders on history changes.
 */
export const useCanvasHistory = ({ readOnly }: UseCanvasHistoryOptions = {}) => {
    const { nodes, connections, setNodes, setConnections } = useCanvasStore();

    // History stacks (refs to avoid re-renders)
    const pastRef = useRef<WorkflowState[]>([]);
    const futureRef = useRef<WorkflowState[]>([]);
    const dragStartSnapshotRef = useRef<WorkflowState | null>(null);

    /**
     * Save current state as a checkpoint for undo
     */
    const saveCheckpoint = useCallback(() => {
        if (readOnly) return;

        pastRef.current.push({
            nodes: JSON.parse(JSON.stringify(nodes)),
            connections: [...connections],
        });
        futureRef.current = [];
    }, [nodes, connections, readOnly]);

    /**
     * Undo to previous state
     */
    const undo = useCallback(() => {
        if (readOnly || pastRef.current.length === 0) return;

        // Save current state to future stack
        futureRef.current.push({
            nodes: JSON.parse(JSON.stringify(nodes)),
            connections: [...connections],
        });

        // Restore previous state
        const previous = pastRef.current.pop();
        if (previous) {
            setNodes(previous.nodes);
            setConnections(previous.connections);
        }
    }, [nodes, connections, readOnly, setNodes, setConnections]);

    /**
     * Redo to next state
     */
    const redo = useCallback(() => {
        if (readOnly || futureRef.current.length === 0) return;

        // Save current state to past stack
        pastRef.current.push({
            nodes: JSON.parse(JSON.stringify(nodes)),
            connections: [...connections],
        });

        // Restore next state
        const next = futureRef.current.pop();
        if (next) {
            setNodes(next.nodes);
            setConnections(next.connections);
        }
    }, [nodes, connections, readOnly, setNodes, setConnections]);

    /**
     * Check if undo is available
     */
    const canUndo = useCallback(() => {
        return !readOnly && pastRef.current.length > 0;
    }, [readOnly]);

    /**
     * Check if redo is available
     */
    const canRedo = useCallback(() => {
        return !readOnly && futureRef.current.length > 0;
    }, [readOnly]);

    /**
     * Clear history stacks
     */
    const clearHistory = useCallback(() => {
        pastRef.current = [];
        futureRef.current = [];
    }, []);

    /**
     * Save snapshot before drag operation
     */
    const saveDragSnapshot = useCallback(() => {
        dragStartSnapshotRef.current = {
            nodes: JSON.parse(JSON.stringify(nodes)),
            connections: [...connections],
        };
    }, [nodes, connections]);

    /**
     * Commit drag snapshot to history (call after drag ends)
     */
    const commitDragSnapshot = useCallback(() => {
        if (dragStartSnapshotRef.current) {
            pastRef.current.push(dragStartSnapshotRef.current);
            futureRef.current = [];
            dragStartSnapshotRef.current = null;
        }
    }, []);

    return {
        // Refs (for external access if needed)
        pastRef,
        futureRef,
        dragStartSnapshotRef,

        // Actions
        saveCheckpoint,
        undo,
        redo,
        canUndo,
        canRedo,
        clearHistory,
        saveDragSnapshot,
        commitDragSnapshot,
    };
};
