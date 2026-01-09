import { createPortal } from 'react-dom';

import { useLoaderStore } from '../hooks/useGlobalLoader';

/**
 * Full-screen loading overlay rendered via portal
 * Uses the global loader store for visibility control
 */
export const GlobalLoader = () => {
    const isLoading = useLoaderStore(state => state.isLoading);

    if (!isLoading) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <span className="text-sm text-muted-foreground">Loading...</span>
            </div>
        </div>,
        document.body
    );
};
