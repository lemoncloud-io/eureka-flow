import { useEffect, useRef } from 'react';

import { useCanvasStore, useFlows } from '@flows/flows';

import type { SerializeWorkflowFn } from './types';

const AUTO_SAVE_DELAY = 2000;

interface UseMobileAutoSaveParams {
    isAppReady: boolean;
    /** Whether the current user can save (false for guest/anonymous) */
    canSave: boolean;
    serializeWorkflowState: SerializeWorkflowFn;
    lastSavedStateRef: React.MutableRefObject<string | null>;
    lastLocalUpdateTimestampRef: React.MutableRefObject<number | null>;
}

export const useMobileAutoSave = ({
    isAppReady,
    canSave,
    serializeWorkflowState,
    lastSavedStateRef,
    lastLocalUpdateTimestampRef,
}: UseMobileAutoSaveParams): void => {
    const { saveCurrentFlow } = useFlows();
    const autoSaveTimerRef = useRef<number | null>(null);

    useEffect(() => {
        if (!canSave || !isAppReady) return;

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
    }, [canSave, isAppReady, saveCurrentFlow, serializeWorkflowState, lastSavedStateRef, lastLocalUpdateTimestampRef]);
};
