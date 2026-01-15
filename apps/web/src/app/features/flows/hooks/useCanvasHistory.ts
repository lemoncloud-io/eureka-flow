import { useCallback, useRef } from 'react';

import type { Connection, NodeData, WorkflowState } from '@lemoncloud/eureka-flows-api';

interface UseCanvasHistoryOptions {
    readOnly?: boolean;
    maxHistory?: number;
}

interface UseCanvasHistoryReturn {
    saveCheckpoint: (nodes: NodeData[], connections: Connection[]) => void;
    undo: (
        currentNodes: NodeData[],
        currentConnections: Connection[],
        setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>,
        setConnections: React.Dispatch<React.SetStateAction<Connection[]>>
    ) => void;
    redo: (
        currentNodes: NodeData[],
        currentConnections: Connection[],
        setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>,
        setConnections: React.Dispatch<React.SetStateAction<Connection[]>>
    ) => void;
    clearHistory: () => void;
    canUndo: () => boolean;
    canRedo: () => boolean;
    saveDragStart: (nodes: NodeData[], connections: Connection[]) => void;
    commitDrag: (nodeId: string, currentNodes: NodeData[], currentConnections: Connection[]) => void;
    cancelDrag: () => void;
}

export const useCanvasHistory = (options: UseCanvasHistoryOptions = {}): UseCanvasHistoryReturn => {
    const { readOnly = false, maxHistory = 50 } = options;

    const pastRef = useRef<WorkflowState[]>([]);
    const futureRef = useRef<WorkflowState[]>([]);
    const dragStartSnapshotRef = useRef<WorkflowState | null>(null);

    const saveCheckpoint = useCallback(
        (nodes: NodeData[], connections: Connection[]) => {
            if (readOnly) return;

            pastRef.current.push({
                nodes: JSON.parse(JSON.stringify(nodes)),
                connections: [...connections],
            });

            if (pastRef.current.length > maxHistory) {
                pastRef.current.shift();
            }

            futureRef.current = [];
        },
        [readOnly, maxHistory]
    );

    const undo = useCallback(
        (
            currentNodes: NodeData[],
            currentConnections: Connection[],
            setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>,
            setConnections: React.Dispatch<React.SetStateAction<Connection[]>>
        ) => {
            if (readOnly || pastRef.current.length === 0) return;

            futureRef.current.push({
                nodes: JSON.parse(JSON.stringify(currentNodes)),
                connections: [...currentConnections],
            });

            const previous = pastRef.current.pop();
            if (previous) {
                setNodes(previous.nodes);
                setConnections(previous.connections);
            }
        },
        [readOnly]
    );

    const redo = useCallback(
        (
            currentNodes: NodeData[],
            currentConnections: Connection[],
            setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>,
            setConnections: React.Dispatch<React.SetStateAction<Connection[]>>
        ) => {
            if (readOnly || futureRef.current.length === 0) return;

            pastRef.current.push({
                nodes: JSON.parse(JSON.stringify(currentNodes)),
                connections: [...currentConnections],
            });

            const next = futureRef.current.pop();
            if (next) {
                setNodes(next.nodes);
                setConnections(next.connections);
            }
        },
        [readOnly]
    );

    const clearHistory = useCallback(() => {
        pastRef.current = [];
        futureRef.current = [];
        dragStartSnapshotRef.current = null;
    }, []);

    const canUndo = useCallback(() => pastRef.current.length > 0, []);
    const canRedo = useCallback(() => futureRef.current.length > 0, []);

    const saveDragStart = useCallback(
        (nodes: NodeData[], connections: Connection[]) => {
            if (readOnly) return;
            dragStartSnapshotRef.current = {
                nodes: JSON.parse(JSON.stringify(nodes)),
                connections: [...connections],
            };
        },
        [readOnly]
    );

    const commitDrag = useCallback((nodeId: string, currentNodes: NodeData[], _currentConnections: Connection[]) => {
        if (!dragStartSnapshotRef.current) return;

        const currentNode = currentNodes.find(n => n.id === nodeId);
        const originalNode = dragStartSnapshotRef.current.nodes.find(n => n.id === nodeId);

        if (
            currentNode &&
            originalNode &&
            (currentNode.position.x !== originalNode.position.x || currentNode.position.y !== originalNode.position.y)
        ) {
            pastRef.current.push(dragStartSnapshotRef.current);
            futureRef.current = [];
        }

        dragStartSnapshotRef.current = null;
    }, []);

    const cancelDrag = useCallback(() => {
        dragStartSnapshotRef.current = null;
    }, []);

    return {
        saveCheckpoint,
        undo,
        redo,
        clearHistory,
        canUndo,
        canRedo,
        saveDragStart,
        commitDrag,
        cancelDrag,
    };
};
