import { useCallback } from 'react';

import { MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';

import { useCanvasStore } from '@flows/flows';

import type { DragEndEvent } from '@dnd-kit/core';

const DRAG_ACTIVATION_DELAY = 250;
const DRAG_TOLERANCE = 5;

interface UseMobileReorderParams {
    orderedNodeIds: string[];
    isReadOnly?: boolean;
}

interface UseMobileReorderReturn {
    sensors: ReturnType<typeof useSensors>;
    handleDragEnd: (event: DragEndEvent) => void;
}

export const useMobileReorder = ({ orderedNodeIds, isReadOnly }: UseMobileReorderParams): UseMobileReorderReturn => {
    const sensors = useSensors(
        useSensor(MouseSensor),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: DRAG_ACTIVATION_DELAY,
                tolerance: DRAG_TOLERANCE,
            },
        })
    );

    const emptySensors = useSensors();

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;

            const oldIndex = orderedNodeIds.indexOf(String(active.id));
            const newIndex = orderedNodeIds.indexOf(String(over.id));
            if (oldIndex === -1 || newIndex === -1) return;

            const reordered = arrayMove(orderedNodeIds, oldIndex, newIndex);

            // Reorder the nodes array in the store to match the new visual order
            const { nodes, setNodes } = useCanvasStore.getState();
            const nodeMap = new Map(nodes.map(n => [n.id, n]));
            const reorderedNodes = reordered
                .map(id => nodeMap.get(id))
                .filter((n): n is NonNullable<typeof n> => n != null);

            // Append any nodes not in orderedNodeIds (safety)
            const reorderedSet = new Set(reordered);
            for (const node of nodes) {
                if (!reorderedSet.has(node.id)) {
                    reorderedNodes.push(node);
                }
            }

            setNodes(reorderedNodes);
        },
        [orderedNodeIds]
    );

    return {
        sensors: isReadOnly ? emptySensors : sensors,
        handleDragEnd,
    };
};
