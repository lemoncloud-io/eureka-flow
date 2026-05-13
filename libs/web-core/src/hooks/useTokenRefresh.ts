import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchProfile, refreshAuthToken } from '../api/auth';
import { isOAuthEnabled } from '../core';
import { useWebCoreStore } from '../stores';
import { classifyError } from '../utils/error';

import type { ErrorClassification } from '../utils/error';

const REFRESH_INTERVAL = 1000 * 60; // 1 minute
const MIN_REFRESH_GAP = 5000; // 5 second dedup

/**
 * Token refresh interval hook.
 * Refreshes auth token every 60s, fetches profile on init.
 * All effects are gated on isOAuthEnabled — zero overhead when disabled.
 */
export const useTokenRefresh = (webCoreReady: boolean) => {
    const { isAuthenticated, setProfile, logout, initState } = useWebCoreStore();

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isRefreshingRef = useRef(false);
    const lastRefreshTime = useRef(0);
    const [isInitialized, setIsInitialized] = useState(!isOAuthEnabled);

    const refreshToken = useCallback(async (): Promise<boolean> => {
        const now = Date.now();
        if (now - lastRefreshTime.current < MIN_REFRESH_GAP || isRefreshingRef.current) return true;

        isRefreshingRef.current = true;
        lastRefreshTime.current = now;

        try {
            await refreshAuthToken();
            return true;
        } catch (error) {
            const classification: ErrorClassification = classifyError(error);
            if (classification.shouldLogout) {
                await logout();
                return false;
            }
            return true;
        } finally {
            isRefreshingRef.current = false;
        }
    }, [logout]);

    const startInterval = useCallback(() => {
        if (intervalRef.current) return;
        intervalRef.current = setInterval(refreshToken, REFRESH_INTERVAL);
    }, [refreshToken]);

    const stopInterval = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    const initialize = useCallback(async () => {
        if (!isAuthenticated || !webCoreReady) return;

        try {
            if (initState !== 'refreshed') {
                const success = await refreshToken();
                if (!success) return;
            }

            const profile = await fetchProfile();
            setProfile(profile);
            setIsInitialized(true);
        } catch (error) {
            console.error('[TokenRefresh] Initialization failed:', error);
            const classification = classifyError(error);
            if (classification.shouldLogout) {
                await logout();
            }
        }
    }, [isAuthenticated, refreshToken, webCoreReady, initState, setProfile, logout]);

    // Gate all effects on isOAuthEnabled — no intervals or init when disabled
    useEffect(() => {
        if (!isOAuthEnabled) return;

        if (isAuthenticated && webCoreReady) {
            initialize().then(() => startInterval());
        } else {
            stopInterval();
            setIsInitialized(false);
        }

        return stopInterval;
    }, [isAuthenticated, initialize, startInterval, stopInterval, webCoreReady]);

    return {
        refreshToken,
        isRefreshing: isRefreshingRef.current,
        isInitialized,
    };
};
