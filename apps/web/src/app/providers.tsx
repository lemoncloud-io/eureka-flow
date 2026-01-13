import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { HelmetProvider } from 'react-helmet-async';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'sonner';

import { ErrorFallback, GlobalLoader, LoadingFallback } from '@flows/shared';
import { ThemeProvider } from '@flows/theme';

import type { ReactNode } from 'react';

const queryClient = new QueryClient({
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
 * Root providers for the application
 * Wraps children with necessary context providers
 */
export const Providers = ({ children }: ProvidersProps) => {
    return (
        <Suspense fallback={<LoadingFallback />}>
            <ErrorBoundary FallbackComponent={ErrorFallback} onReset={() => window.location.reload()}>
                <HelmetProvider>
                    <QueryClientProvider client={queryClient}>
                        <ThemeProvider defaultTheme="dark" storageKey="flows-theme">
                            {children}
                            <GlobalLoader />
                            <Toaster />
                        </ThemeProvider>
                        {import.meta.env.DEV && <ReactQueryDevtools />}
                    </QueryClientProvider>
                </HelmetProvider>
            </ErrorBoundary>
        </Suspense>
    );
};
