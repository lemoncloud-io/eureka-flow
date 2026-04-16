/**
 * Loading state fallback component
 * Used for Suspense boundaries and loading states
 */
export const LoadingFallback = (): JSX.Element => {
    return (
        <div className="flex min-h-screen items-center justify-center">
            <div className="w-8 h-8 border-2 border-border/40 border-t-primary rounded-full animate-spin" />
        </div>
    );
};
