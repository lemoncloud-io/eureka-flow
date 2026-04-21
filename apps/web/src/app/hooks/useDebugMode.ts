import { useCallback, useRef, useState } from 'react';

const STORAGE_KEY = 'eureka-debug-mode';
const REQUIRED_CLICKS = 10;
const CLICK_WINDOW_MS = 3000;

const getStoredDebugMode = (): boolean => {
    try {
        return sessionStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
};

const setStoredDebugMode = (enabled: boolean): void => {
    try {
        if (enabled) {
            sessionStorage.setItem(STORAGE_KEY, 'true');
        } else {
            sessionStorage.removeItem(STORAGE_KEY);
        }
    } catch {
        // ignore storage errors
    }
};

/**
 * Debug mode activated by rapidly clicking the version text 10 times within 3 seconds.
 * Persists in sessionStorage (cleared on browser close).
 */
export const useDebugMode = () => {
    const [isDebugMode, setIsDebugMode] = useState(getStoredDebugMode);
    const clickTimestamps = useRef<number[]>([]);

    const handleVersionClick = useCallback(() => {
        const now = Date.now();
        // Keep only clicks within the time window
        clickTimestamps.current = clickTimestamps.current.filter(ts => now - ts < CLICK_WINDOW_MS);
        clickTimestamps.current.push(now);

        if (clickTimestamps.current.length >= REQUIRED_CLICKS) {
            clickTimestamps.current = [];
            const next = !getStoredDebugMode();
            setStoredDebugMode(next);
            setIsDebugMode(next);
        }
    }, []);

    const disableDebugMode = useCallback(() => {
        setStoredDebugMode(false);
        setIsDebugMode(false);
    }, []);

    return { isDebugMode, handleVersionClick, disableDebugMode } as const;
};
