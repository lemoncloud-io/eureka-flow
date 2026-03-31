import { Suspense, useCallback, useEffect, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { HelmetProvider } from 'react-helmet-async';
import { I18nextProvider } from 'react-i18next';

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'sonner';

import { flowStorage } from '@flows/flows';
import {
    ApiKeyDialog,
    ErrorFallback,
    GlobalLoader,
    LoadingFallback,
    VersionUpdateBanner,
    useVersionCheck,
} from '@flows/shared';
import { ThemeProvider } from '@flows/theme';
import { reportError, useWebCoreStore, validateApiKey } from '@flows/web-core';

import { i18n } from '../i18n';

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
 * Check if current path is a public route that doesn't require authentication
 */
const isPublicRoute = (): boolean => {
    const pathname = window.location.pathname;
    return pathname === '/' || pathname.startsWith('/flow/examples') || pathname.startsWith('/policy/');
};

/**
 * API Key gate component
 * Blocks app content until a valid API key is provided
 * Bypasses authentication for public routes (landing, demo)
 */
const ApiKeyGate = ({ children }: { children: ReactNode }) => {
    const { apiKey, setApiKey, initializeApiKey } = useWebCoreStore();
    const [error, setError] = useState<string | null>(null);

    const [isInitialized, setIsInitialized] = useState(false);

    useEffect(() => {
        initializeApiKey();
        setIsInitialized(true);
    }, [initializeApiKey]);

    // Clear flow ID and redirect to root when no API key on flow pages (only after initialization)
    useEffect(() => {
        if (isInitialized && !apiKey && window.location.pathname.startsWith('/flows/')) {
            flowStorage.clearFlowId();
            window.location.href = '/';
        }
    }, [isInitialized, apiKey]);

    const handleApiKeySubmit = async (key: string): Promise<boolean> => {
        setError(null);
        const isValid = await validateApiKey(key);
        if (isValid) {
            setApiKey(key);
            return true;
        }
        setError('Invalid API key. Please try again.');
        return false;
    };

    // Bypass authentication for public routes (landing, demo)
    if (isPublicRoute()) {
        return children;
    }

    if (!apiKey) {
        const codesUrl = import.meta.env.VITE_CODES_URL;
        const handleClose = (open: boolean) => {
            if (!open) {
                window.location.href = '/';
            }
        };
        return (
            <ApiKeyDialog
                open={true}
                onSubmit={handleApiKeySubmit}
                onOpenChange={handleClose}
                error={error}
                codesUrl={codesUrl}
            />
        );
    }

    return children;
};

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
                                <ApiKeyGate>
                                    <AppContent>{children}</AppContent>
                                </ApiKeyGate>
                                <Toaster
                                    position="bottom-right"
                                    toastOptions={{
                                        classNames: {
                                            toast: 'backdrop-blur-md bg-background/95 border-border/50 shadow-lg',
                                            title: 'text-foreground text-sm font-medium',
                                            description: 'text-muted-foreground text-xs',
                                            actionButton: 'bg-primary text-primary-foreground text-xs',
                                        },
                                    }}
                                />
                            </ThemeProvider>
                            {import.meta.env.DEV && <ReactQueryDevtools />}
                        </QueryClientProvider>
                    </HelmetProvider>
                </I18nextProvider>
            </ErrorBoundary>
        </Suspense>
    );
};
