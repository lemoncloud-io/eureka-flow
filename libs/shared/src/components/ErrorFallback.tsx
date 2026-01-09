import type { FallbackProps } from 'react-error-boundary';

/**
 * Error boundary fallback component
 * Displays error information with a reset button
 */
export const ErrorFallback = ({ error, resetErrorBoundary }: FallbackProps) => {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
                <h2 className="mb-2 text-lg font-semibold text-destructive">Something went wrong</h2>
                <p className="mb-4 text-sm text-muted-foreground">{error.message}</p>
                <button
                    onClick={resetErrorBoundary}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                    Try again
                </button>
            </div>
        </div>
    );
};
