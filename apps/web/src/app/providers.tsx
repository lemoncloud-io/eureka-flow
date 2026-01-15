import { Suspense, useCallback } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { HelmetProvider } from 'react-helmet-async';
import { I18nextProvider } from 'react-i18next';

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'sonner';

import { ErrorFallback, GlobalLoader, LoadingFallback, VersionUpdateBanner, useVersionCheck } from '@flows/shared';
import { ThemeProvider } from '@flows/theme';
import { reportError } from '@flows/web-core';

import i18n from '../i18n';

import type { ErrorInfo, ReactNode } from 'react';

const mutationCache = new MutationCache({
    onError: (error: Error): void => {
        reportError(error, {}, 'web');
    },
});

const queryClient = new QueryClient({
    mutationCache,
    defaultOptions: {
        queries: {
            staleTime: Infinity,
            retry: 1,
        },
    },
});

interface ProvidersProps {
    children: ReactNode;
}

/**
 * App content with version check banner
 */
const AppContent = ({ children }: { children: ReactNode }) => {
    const { hasUpdate, currentVersion, latestVersion, dismissUpdate } = useVersionCheck();

    return (
        <>
            <VersionUpdateBanner
                isVisible={hasUpdate}
                currentVersion={currentVersion}
                latestVersion={latestVersion}
                onDismiss={dismissUpdate}
            />
            {children}
            <GlobalLoader />
            <Toaster />
        </>
    );
};

/**
 * Root providers for the application
 * Wraps children with necessary context providers
 */
export const Providers = ({ children }: ProvidersProps) => {
    const handleError = useCallback((error: Error, info: ErrorInfo): void => {
        console.error('Application Error:', error, info);
        reportError(error, { componentStack: info.componentStack ?? undefined }, 'web');
    }, []);

    return (
        <Suspense fallback={<LoadingFallback />}>
            <ErrorBoundary FallbackComponent={ErrorFallback} onError={handleError}>
                <I18nextProvider i18n={i18n}>
                    <HelmetProvider>
                        <QueryClientProvider client={queryClient}>
                            <ThemeProvider defaultTheme="dark" storageKey="flows-theme">
                                <AppContent>{children}</AppContent>
                            </ThemeProvider>
                            {import.meta.env.DEV && <ReactQueryDevtools />}
                        </QueryClientProvider>
                    </HelmetProvider>
                </I18nextProvider>
            </ErrorBoundary>
        </Suspense>
    );
};
