import { useCallback, useEffect, useRef, useState } from 'react';

import { useWebCoreStore } from '../stores';
import { classifyError } from '../utils';

import type { ErrorClassification } from '../utils';

const REFRESH_INTERVAL = 1000 * 60; // 1 minute
const MIN_REFRESH_GAP = 5000; // 5 seconds minimum gap

/**
 * Hook for automatic token refresh
 *
 * @param webCoreReady - Whether web core is initialized
 * @returns Object containing refresh function and state
 */
export const useTokenRefresh = (webCoreReady: boolean) => {
    const { isAuthenticated, logout } = useWebCoreStore();

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isRefreshingRef = useRef(false);
    const lastRefreshTime = useRef(0);
    const isInitializedRef = useRef(false);

    const [isInitialized, setIsInitialized] = useState<boolean>(false);

    const refreshToken = useCallback(async (): Promise<boolean> => {
        const now = Date.now();
        const isDuplicated = now - lastRefreshTime.current < MIN_REFRESH_GAP || isRefreshingRef.current;
        if (isDuplicated) {
            return true;
        }

        isRefreshingRef.current = true;
        lastRefreshTime.current = now;

        try {
            // TODO: Implement actual token refresh when API is available
            // await refreshAuthToken();
            console.log('🔄 Token refresh check (placeholder)');
            return true;
        } catch (error) {
            console.error('❌ Token refresh failed:', error);
            const errorClassification: ErrorClassification = classifyError(error);
            if (errorClassification.shouldLogout) {
                console.log('🚪 Token completely expired or invalid - logging out...');
                await logout();
                return false;
            }
            console.log('⚠️ Temporary refresh failure, will retry later');
            return true;
        } finally {
            isRefreshingRef.current = false;
        }
    }, [logout]);

    const startInterval = useCallback(() => {
        if (intervalRef.current) {
            return;
        }

        console.log(`🚀 Starting token refresh interval: ${REFRESH_INTERVAL}ms`);
        intervalRef.current = setInterval(refreshToken, REFRESH_INTERVAL);
    }, [refreshToken]);

    const stopInterval = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
            console.log('🛑 Stopped token refresh interval');
        }
    }, []);

    const markAsInitialized = useCallback(() => {
        isInitializedRef.current = true;
        setIsInitialized(true);
    }, []);

    const initialize = useCallback(async () => {
        if (!isAuthenticated || !webCoreReady || isInitializedRef.current) {
            return;
        }

        console.log('🏁 Initializing: checking token validity...');

        const refreshSuccess = await refreshToken();
        if (!refreshSuccess) {
            markAsInitialized();
            return;
        }

        markAsInitialized();
    }, [isAuthenticated, refreshToken, webCoreReady, markAsInitialized]);

    useEffect(() => {
        if (isAuthenticated && webCoreReady) {
            initialize().then(() => {
                if (isInitializedRef.current) {
                    startInterval();
                }
            });
        } else {
            stopInterval();
            isInitializedRef.current = false;
        }

        return stopInterval;
    }, [isAuthenticated, initialize, startInterval, stopInterval, webCoreReady]);

    return {
        refreshToken,
        isRefreshing: isRefreshingRef.current,
        isInitialized,
    };
};
