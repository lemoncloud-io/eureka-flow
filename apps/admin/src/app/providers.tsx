import { Suspense, useCallback } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'sonner';

import { ErrorFallback, LoadingFallback } from '@flows/shared';
import { ThemeProvider } from '@flows/theme';
import { reportError } from '@flows/web-core';

import type { ErrorInfo, ReactNode } from 'react';

const mutationCache = new MutationCache({
    onError: (error: Error): void => {
        reportError(error, {}, 'admin');
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

export const Providers = ({ children }: ProvidersProps) => {
    const handleError = useCallback((error: Error, info: ErrorInfo): void => {
        console.error('Application Error:', error, info);
        reportError(error, { componentStack: info.componentStack ?? undefined }, 'admin');
    }, []);

    return (
        <Suspense fallback={<LoadingFallback />}>
            <ErrorBoundary FallbackComponent={ErrorFallback} onError={handleError}>
                <QueryClientProvider client={queryClient}>
                    <ThemeProvider defaultTheme="dark" storageKey="admin-theme">
                        {children}
                        <Toaster />
                    </ThemeProvider>
                    {import.meta.env.DEV && <ReactQueryDevtools />}
                </QueryClientProvider>
            </ErrorBoundary>
        </Suspense>
    );
};
