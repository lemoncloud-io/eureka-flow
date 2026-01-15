import { useCallback, useEffect, useState } from 'react';

import type { Viewport } from './useCanvasViewport';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

interface UseCanvasSelectionOptions {
    readOnly?: boolean;
    onNodeSelect?: (nodeId: string | null) => void;
}

interface UseCanvasSelectionReturn {
    selectedNodeIds: Set<string>;
    selectedConnectionId: string | null;
    hoveredConnectionId: string | null;
    clipboard: NodeData[];
    setSelectedNodeIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    setSelectedConnectionId: React.Dispatch<React.SetStateAction<string | null>>;
    setHoveredConnectionId: React.Dispatch<React.SetStateAction<string | null>>;
    selectNode: (nodeId: string | null, addToSelection?: boolean) => void;
    selectNodes: (nodeIds: string[]) => void;
    selectConnection: (connectionId: string | null) => void;
    clearSelection: () => void;
    copySelectedNodes: (nodes: NodeData[]) => void;
    pasteNodes: (
        viewport: Viewport,
        canvasRect: DOMRect | null,
        gridSize: number,
        onPaste: (newNodes: NodeData[]) => void
    ) => void;
    deleteSelected: (onDeleteNodes: (ids: string[]) => void, onDeleteConnection: (id: string) => void) => void;
    isNodeSelected: (nodeId: string) => boolean;
    hasSelection: () => boolean;
}

export const useCanvasSelection = (options: UseCanvasSelectionOptions = {}): UseCanvasSelectionReturn => {
    const { readOnly = false, onNodeSelect } = options;

    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
    const [hoveredConnectionId, setHoveredConnectionId] = useState<string | null>(null);
    const [clipboard, setClipboard] = useState<NodeData[]>([]);

    const selectNode = useCallback(
        (nodeId: string | null, addToSelection = false) => {
            if (nodeId === null) {
                setSelectedNodeIds(new Set());
                onNodeSelect?.(null);
                return;
            }

            if (addToSelection) {
                setSelectedNodeIds(prev => {
                    const next = new Set(prev);
                    if (next.has(nodeId)) {
                        next.delete(nodeId);
                    } else {
                        next.add(nodeId);
                    }
                    return next;
                });
            } else {
                setSelectedNodeIds(new Set([nodeId]));
            }

            setSelectedConnectionId(null);
            onNodeSelect?.(nodeId);
        },
        [onNodeSelect]
    );

    const selectNodes = useCallback((nodeIds: string[]) => {
        setSelectedNodeIds(new Set(nodeIds));
        setSelectedConnectionId(null);
    }, []);

    const selectConnection = useCallback(
        (connectionId: string | null) => {
            setSelectedConnectionId(connectionId);
            setSelectedNodeIds(new Set());
            onNodeSelect?.(null);
        },
        [onNodeSelect]
    );

    const clearSelection = useCallback(() => {
        setSelectedNodeIds(new Set());
        setSelectedConnectionId(null);
        onNodeSelect?.(null);
    }, [onNodeSelect]);

    const copySelectedNodes = useCallback(
        (nodes: NodeData[]) => {
            if (readOnly || selectedNodeIds.size === 0) return;
            const nodesToCopy = nodes.filter(n => selectedNodeIds.has(n.id));
            if (nodesToCopy.length > 0) {
                setClipboard(nodesToCopy);
            }
        },
        [readOnly, selectedNodeIds]
    );

    const pasteNodes = useCallback(
        (viewport: Viewport, canvasRect: DOMRect | null, gridSize: number, onPaste: (newNodes: NodeData[]) => void) => {
            if (readOnly || clipboard.length === 0 || !canvasRect) return;

            const baseX = (canvasRect.width / 2 - viewport.x) / viewport.zoom - 100;
            const baseY = (canvasRect.height / 2 - viewport.y) / viewport.zoom - 50;

            const newNodes = clipboard.map((node, idx) => {
                const offsetX = idx * 30 + Math.random() * 20 - 10;
                const offsetY = idx * 30 + Math.random() * 20 - 10;

                return {
                    ...node,
                    id: Math.random().toString(36).slice(2, 11),
                    position: {
                        x: Math.round((baseX + offsetX) / gridSize) * gridSize,
                        y: Math.round((baseY + offsetY) / gridSize) * gridSize,
                    },
                    status: 'IDLE' as const,
                    inputData: {},
                    outputData: {},
                    errorMessage: undefined,
                    config: JSON.parse(JSON.stringify(node.config)),
                    autoExecutionEnabled: node.autoExecutionEnabled ?? true,
                    customLabel: node.customLabel,
                };
            });

            onPaste(newNodes);
            setSelectedNodeIds(new Set(newNodes.map(n => n.id)));
        },
        [readOnly, clipboard]
    );

    const deleteSelected = useCallback(
        (onDeleteNodes: (ids: string[]) => void, onDeleteConnection: (id: string) => void) => {
            if (readOnly) return;

            if (selectedNodeIds.size > 0) {
                onDeleteNodes(Array.from(selectedNodeIds));
                setSelectedNodeIds(new Set());
            } else if (selectedConnectionId || hoveredConnectionId) {
                const targetId = selectedConnectionId || hoveredConnectionId;
                if (targetId) {
                    onDeleteConnection(targetId);
                    setSelectedConnectionId(null);
                    setHoveredConnectionId(null);
                }
            }
        },
        [readOnly, selectedNodeIds, selectedConnectionId, hoveredConnectionId]
    );

    const isNodeSelected = useCallback((nodeId: string) => selectedNodeIds.has(nodeId), [selectedNodeIds]);

    const hasSelection = useCallback(
        () => selectedNodeIds.size > 0 || selectedConnectionId !== null,
        [selectedNodeIds, selectedConnectionId]
    );

    return {
        selectedNodeIds,
        selectedConnectionId,
        hoveredConnectionId,
        clipboard,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setHoveredConnectionId,
        selectNode,
        selectNodes,
        selectConnection,
        clearSelection,
        copySelectedNodes,
        pasteNodes,
        deleteSelected,
        isNodeSelected,
        hasSelection,
    };
};

interface UseCanvasKeyboardOptions {
    readOnly?: boolean;
    nodes: NodeData[];
    selectedNodeIds: Set<string>;
    selectedConnectionId: string | null;
    hoveredConnectionId: string | null;
    clipboard: NodeData[];
    viewport: Viewport;
    canvasRect: DOMRect | null;
    gridSize: number;
    onCopy: (nodes: NodeData[]) => void;
    onPaste: (newNodes: NodeData[]) => void;
    onDeleteNodes: (ids: string[]) => void;
    onDeleteConnection: (id: string) => void;
    onClearSelection: () => void;
    onSaveCheckpoint: () => void;
}

export const useCanvasKeyboard = (options: UseCanvasKeyboardOptions) => {
    const {
        readOnly,
        nodes,
        selectedNodeIds,
        selectedConnectionId,
        hoveredConnectionId,
        clipboard,
        viewport,
        canvasRect,
        gridSize,
        onCopy,
        onPaste,
        onDeleteNodes,
        onDeleteConnection,
        onClearSelection,
        onSaveCheckpoint,
    } = options;

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (readOnly) return;

            const target = e.target as HTMLElement;
            const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
            if (isInput) return;

            const isCtrlOrCmd = e.ctrlKey || e.metaKey;

            // Copy
            if (isCtrlOrCmd && e.key.toLowerCase() === 'c') {
                if (selectedNodeIds.size > 0) {
                    const nodesToCopy = nodes.filter(n => selectedNodeIds.has(n.id));
                    onCopy(nodesToCopy);
                }
            }

            // Paste
            if (isCtrlOrCmd && e.key.toLowerCase() === 'v') {
                if (clipboard.length > 0 && canvasRect) {
                    onSaveCheckpoint();

                    const baseX = (canvasRect.width / 2 - viewport.x) / viewport.zoom - 100;
                    const baseY = (canvasRect.height / 2 - viewport.y) / viewport.zoom - 50;

                    const newNodes = clipboard.map((node, idx) => {
                        const offsetX = idx * 30 + Math.random() * 20 - 10;
                        const offsetY = idx * 30 + Math.random() * 20 - 10;

                        return {
                            ...node,
                            id: Math.random().toString(36).slice(2, 11),
                            position: {
                                x: Math.round((baseX + offsetX) / gridSize) * gridSize,
                                y: Math.round((baseY + offsetY) / gridSize) * gridSize,
                            },
                            status: 'IDLE' as const,
                            inputData: {},
                            outputData: {},
                            errorMessage: undefined,
                            config: JSON.parse(JSON.stringify(node.config)),
                            autoExecutionEnabled: node.autoExecutionEnabled ?? true,
                            customLabel: node.customLabel,
                        };
                    });

                    onPaste(newNodes);
                }
            }

            // Duplicate (Ctrl+D)
            if (isCtrlOrCmd && e.key.toLowerCase() === 'd') {
                e.preventDefault();
                if (selectedNodeIds.size > 0 && canvasRect) {
                    onSaveCheckpoint();

                    const nodesToDuplicate = nodes.filter(n => selectedNodeIds.has(n.id));
                    const newNodes = nodesToDuplicate.map(node => ({
                        ...node,
                        id: Math.random().toString(36).slice(2, 11),
                        position: {
                            x: Math.round((node.position.x + 40) / gridSize) * gridSize,
                            y: Math.round((node.position.y + 40) / gridSize) * gridSize,
                        },
                        status: 'IDLE' as const,
                        inputData: {},
                        outputData: {},
                        errorMessage: undefined,
                        config: JSON.parse(JSON.stringify(node.config)),
                        autoExecutionEnabled: node.autoExecutionEnabled ?? true,
                        customLabel: node.customLabel,
                    }));

                    onPaste(newNodes);
                }
            }

            // Delete
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedNodeIds.size > 0) {
                    onSaveCheckpoint();
                    onDeleteNodes(Array.from(selectedNodeIds));
                } else if (selectedConnectionId || hoveredConnectionId) {
                    const targetId = selectedConnectionId || hoveredConnectionId;
                    if (targetId) {
                        onSaveCheckpoint();
                        onDeleteConnection(targetId);
                    }
                }
            }

            // Escape - Clear selection
            if (e.key === 'Escape') {
                onClearSelection();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        readOnly,
        nodes,
        selectedNodeIds,
        selectedConnectionId,
        hoveredConnectionId,
        clipboard,
        viewport,
        canvasRect,
        gridSize,
        onCopy,
        onPaste,
        onDeleteNodes,
        onDeleteConnection,
        onClearSelection,
        onSaveCheckpoint,
    ]);
};
