import { ErrorBoundary } from 'react-error-boundary';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ErrorFallback, GlobalLoader } from '@eureka/shared';
import { ThemeProvider } from '@eureka/theme';

import type { ReactNode } from 'react';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
            retry: 1,
            refetchOnWindowFocus: false,
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
        <ErrorBoundary FallbackComponent={ErrorFallback} onReset={() => window.location.reload()}>
            <QueryClientProvider client={queryClient}>
                <ThemeProvider defaultTheme="dark" storageKey="eureka-flows-theme">
                    {children}
                    <GlobalLoader />
                </ThemeProvider>
            </QueryClientProvider>
        </ErrorBoundary>
    );
};
