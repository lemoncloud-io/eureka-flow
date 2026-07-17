import { useEffect, useRef } from 'react';

import { diffAgainstBaseline, useCanvasStore, useFlows, useIsAutoSaveEnabled } from '@flows/flows';

const AUTO_SAVE_DELAY = 2000;

interface UseMobileAutoSaveParams {
    isAppReady: boolean;
    /** Whether the current user can save (Owner + Editor; false for viewer/anonymous) */
    canSave: boolean;
    lastLocalUpdateTimestampRef: React.MutableRefObject<number | null>;
}

export const useMobileAutoSave = ({
    isAppReady,
    canSave,
    lastLocalUpdateTimestampRef,
}: UseMobileAutoSaveParams): void => {
    const { saveCurrentFlow } = useFlows();
    const isAutoSaveEnabled = useIsAutoSaveEnabled();
    const autoSaveTimerRef = useRef<number | null>(null);

    useEffect(() => {
        if (!canSave || !isAppReady || !isAutoSaveEnabled) return;

        const unsub = useCanvasStore.subscribe((state, prevState) => {
            if (state.nodes !== prevState.nodes || state.connections !== prevState.connections) {
                if (autoSaveTimerRef.current) {
                    window.clearTimeout(autoSaveTimerRef.current);
                }
                autoSaveTimerRef.current = window.setTimeout(() => {
                    const { nodes, connections } = useCanvasStore.getState();

                    // Nothing to save if the graph matches the baseline. A run rewrites
                    // node status and port data, and the diff ignores all of it —
                    // otherwise running a flow would look like an edit and save itself
                    // in a circle.
                    if (!diffAgainstBaseline({ nodes, connections }).isEmpty) {
                        lastLocalUpdateTimestampRef.current = Date.now();
                        saveCurrentFlow({ nodes, connections });
                    }
                }, AUTO_SAVE_DELAY);
            }
        });

        return () => {
            unsub();
            if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
        };
    }, [canSave, isAppReady, isAutoSaveEnabled, saveCurrentFlow, lastLocalUpdateTimestampRef]);
};
