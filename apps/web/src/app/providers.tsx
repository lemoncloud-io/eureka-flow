import { Suspense, useCallback, useEffect, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { HelmetProvider } from 'react-helmet-async';
import { I18nextProvider } from 'react-i18next';

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';

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
import {
    isOAuthEnabled,
    redirectToLogin,
    reportError,
    useInitWebCore,
    useTokenRefresh,
    useWebCoreStore,
    validateApiKey,
} from '@flows/web-core';

import { i18n } from '../i18n';
import { useApiKeyTour } from './features/tutorial';

import type { ErrorInfo, ReactNode } from 'react';

const mutationCache = new MutationCache({
    onError: (error: Error): void => {
        reportError(error, {}, 'web');
        toast.error(error.message || 'Something went wrong');
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
 * Check if current path is a public route that doesn't require authentication.
 * /flows/:id is allowed without API key for read-only public viewing.
 */
const isPublicRoute = (): boolean => {
    const pathname = window.location.pathname;
    return (
        pathname === '/' ||
        pathname === '/flows' ||
        pathname === '/apps' ||
        pathname === '/tutorial' ||
        pathname.startsWith('/flows/') ||
        pathname.startsWith('/policy/') ||
        pathname.startsWith('/auth/') ||
        // Dev-only: the agent environment harness needs no editor auth (fake LLM, in-memory
        // canvas) — real app/editor routes are unaffected, and this never exists in a prod build.
        (import.meta.env.DEV && pathname === '/dev/agent-harness')
    );
};

// Note: Navigator routes (/items/*, /processes/*, /actors, /tools) are NOT public.
// They will be caught by the ApiKeyGate and require authentication.

const CODES_URL = import.meta.env.VITE_CODES_URL;

const ApiKeyGateDialog = ({
    onSubmit,
    error,
}: {
    onSubmit: (key: string) => Promise<boolean>;
    error: string | null;
}) => {
    useApiKeyTour();

    const handleClose = (open: boolean) => {
        if (!open) {
            window.location.href = '/';
        }
    };

    return (
        <ApiKeyDialog open={true} onSubmit={onSubmit} onOpenChange={handleClose} error={error} codesUrl={CODES_URL} />
    );
};

/**
 * API Key gate component
 * Blocks app content until a valid API key is provided.
 * When OAuth is enabled: redirects to login page.
 * When OAuth is disabled: shows API key dialog (existing behavior).
 */
const ApiKeyGate = ({ children }: { children: ReactNode }) => {
    const { apiKey, setApiKey } = useWebCoreStore();
    const [error, setError] = useState<string | null>(null);

    // Clear flow ID when no API key on flow pages
    // Note: /flows/:id is allowed without API key for public viewing
    useEffect(() => {
        if (!apiKey && window.location.pathname.startsWith('/flows/')) {
            flowStorage.clearFlowId();
        }
    }, [apiKey]);

    const handleApiKeySubmit = async (key: string): Promise<boolean> => {
        setError(null);
        const result = await validateApiKey(key);
        if (result.valid) {
            setApiKey(key);
            useWebCoreStore.getState().addApiKey(key, { profile: result.profile });
            return true;
        }
        setError('Invalid API key. Please try again.');
        return false;
    };

    // Bypass authentication for public routes (landing, auth, demo)
    if (isPublicRoute()) {
        return children;
    }

    if (!apiKey) {
        if (redirectToLogin()) {
            return <LoadingFallback />;
        }
        return <ApiKeyGateDialog onSubmit={handleApiKeySubmit} error={error} />;
    }

    return children;
};

/**
 * WebCore initialization gate.
 * When OAuth is enabled, waits for webCore.init() + token refresh before rendering.
 * When OAuth is disabled, passes through immediately after init.
 */
const WebCoreGate = ({ children }: { children: ReactNode }) => {
    const isWebCoreReady = useInitWebCore();
    const { isAuthenticated } = useWebCoreStore();
    const { isInitialized: isTokenInitialized } = useTokenRefresh(isWebCoreReady);

    // If not OAuth mode, render as soon as webCore is ready (instant for API-key-only mode)
    if (!isOAuthEnabled) {
        if (!isWebCoreReady) return <LoadingFallback />;
        return children;
    }

    // OAuth mode: wait for token refresh to complete if authenticated
    const canRender = isWebCoreReady && (!isAuthenticated || isTokenInitialized);
    if (!canRender) return <LoadingFallback />;

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

    // Force re-render when i18n bundles change via postMessage (iframe preview mode)
    // react-i18next's useSyncExternalStore doesn't reliably pick up addResourceBundle changes,
    // so we use React state to guarantee the component tree re-renders
    const [, setI18nRevision] = useState(0);
    useEffect(() => {
        if (window.parent === window) return;
        const onBundleAdded = () => setI18nRevision(r => r + 1);
        i18n.store.on('added', onBundleAdded);
        return () => i18n.store.off('added', onBundleAdded);
    }, []);

    return (
        <Suspense fallback={<LoadingFallback />}>
            <ErrorBoundary FallbackComponent={ErrorFallback} onError={handleError}>
                <I18nextProvider i18n={i18n}>
                    <HelmetProvider>
                        <QueryClientProvider client={queryClient}>
                            <ThemeProvider defaultTheme="dark" storageKey="flows-theme">
                                <WebCoreGate>
                                    <ApiKeyGate>
                                        <AppContent>{children}</AppContent>
                                    </ApiKeyGate>
                                </WebCoreGate>
                                <Toaster
                                    position={window.innerWidth <= 767 ? 'top-center' : 'bottom-right'}
                                    richColors
                                    closeButton
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
                        </QueryClientProvider>
                    </HelmetProvider>
                </I18nextProvider>
            </ErrorBoundary>
        </Suspense>
    );
};
