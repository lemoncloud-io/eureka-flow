import { useCallback, useState } from 'react';

export const useStepNavigation = () => {
    const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

    const isOpen = activeNodeId !== null;

    const openStep = useCallback((nodeId: string) => {
        setActiveNodeId(nodeId);
    }, []);

    const closeStep = useCallback(() => {
        setActiveNodeId(null);
    }, []);

    return { activeNodeId, isOpen, openStep, closeStep };
};
