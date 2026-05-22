import { useEffect, useRef } from 'react';

import { toast } from 'sonner';

import { averageProgress, isErrorProductState, isTerminalProductState, useProductProgressStore } from '@flows/flows';

const AUTO_DISMISS_MS = 5000;

/**
 * Subscribes to product progress and surfaces each entry as a sonner toast.
 * Uses a stable id per productId so updates replace the same toast in place.
 * Terminal (done/error/etc) toasts auto-dismiss after 5s.
 */
export const useProductProgressToasts = () => {
    const entries = useProductProgressStore(state => state.entries);
    const dismissProgress = useProductProgressStore(state => state.dismissProgress);
    const dismissTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    useEffect(() => {
        Object.values(entries).forEach(entry => {
            const toastId = `product-${entry.productId}`;
            const overall = averageProgress(entry.progress$);
            const description = `${entry.state} • ${overall}%`;
            const terminal = isTerminalProductState(entry.state);

            if (terminal) {
                if (isErrorProductState(entry.state)) {
                    toast.error(entry.productId, { id: toastId, description });
                } else {
                    toast.success(entry.productId, { id: toastId, description });
                }
                if (!dismissTimersRef.current[entry.productId]) {
                    dismissTimersRef.current[entry.productId] = setTimeout(() => {
                        delete dismissTimersRef.current[entry.productId];
                        dismissProgress(entry.productId);
                    }, AUTO_DISMISS_MS);
                }
            } else {
                toast.loading(entry.productId, { id: toastId, description });
            }
        });
    }, [entries, dismissProgress]);

    useEffect(() => {
        const timers = dismissTimersRef.current;
        return () => {
            Object.values(timers).forEach(t => clearTimeout(t));
        };
    }, []);
};
