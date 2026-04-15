import { useCallback, useState } from 'react';

export const useStepNavigation = (orderedNodeIds: string[]) => {
    const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

    const activeStepIndex = activeNodeId ? orderedNodeIds.indexOf(activeNodeId) : -1;
    const hasNextStep = activeStepIndex >= 0 && activeStepIndex < orderedNodeIds.length - 1;
    const hasPrevStep = activeStepIndex > 0;
    const isOpen = activeNodeId !== null;

    const openStep = useCallback((nodeId: string) => {
        setActiveNodeId(nodeId);
    }, []);

    const closeStep = useCallback(() => {
        setActiveNodeId(null);
    }, []);

    const goToNextStep = useCallback(() => {
        if (activeStepIndex >= 0 && activeStepIndex < orderedNodeIds.length - 1) {
            setActiveNodeId(orderedNodeIds[activeStepIndex + 1]);
        }
    }, [activeStepIndex, orderedNodeIds]);

    const goToPrevStep = useCallback(() => {
        if (activeStepIndex > 0) {
            setActiveNodeId(orderedNodeIds[activeStepIndex - 1]);
        }
    }, [activeStepIndex, orderedNodeIds]);

    return {
        activeNodeId,
        activeStepIndex,
        hasNextStep,
        hasPrevStep,
        isOpen,
        openStep,
        closeStep,
        goToNextStep,
        goToPrevStep,
    };
};
