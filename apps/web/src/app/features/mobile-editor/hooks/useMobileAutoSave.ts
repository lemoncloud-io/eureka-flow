import { useEffect, useRef } from 'react';

import { useCanvasStore, useFlows } from '@flows/flows';

import type { SerializeWorkflowFn } from './types';

const AUTO_SAVE_DELAY = 2000;

interface UseMobileAutoSaveParams {
    isAppReady: boolean;
    isPublicMode: boolean;
    serializeWorkflowState: SerializeWorkflowFn;
    lastSavedStateRef: React.MutableRefObject<string | null>;
    lastLocalUpdateTimestampRef: React.MutableRefObject<number | null>;
}

export const useMobileAutoSave = ({
    isAppReady,
    isPublicMode,
    serializeWorkflowState,
    lastSavedStateRef,
    lastLocalUpdateTimestampRef,
}: UseMobileAutoSaveParams): void => {
    const { saveCurrentFlow } = useFlows();
    const autoSaveTimerRef = useRef<number | null>(null);

    useEffect(() => {
        if (isPublicMode || !isAppReady) return;

        const unsub = useCanvasStore.subscribe((state, prevState) => {
            if (state.nodes !== prevState.nodes || state.connections !== prevState.connections) {
                if (autoSaveTimerRef.current) {
                    window.clearTimeout(autoSaveTimerRef.current);
                }
                autoSaveTimerRef.current = window.setTimeout(() => {
                    const { nodes, connections } = useCanvasStore.getState();
                    const currentState = serializeWorkflowState({ nodes, connections });
                    if (currentState !== lastSavedStateRef.current) {
                        lastLocalUpdateTimestampRef.current = Date.now();
                        saveCurrentFlow({ nodes, connections });
                        lastSavedStateRef.current = currentState;
                    }
                }, AUTO_SAVE_DELAY);
            }
        });

        return () => {
            unsub();
            if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
        };
    }, [
        isPublicMode,
        isAppReady,
        saveCurrentFlow,
        serializeWorkflowState,
        lastSavedStateRef,
        lastLocalUpdateTimestampRef,
    ]);
};
