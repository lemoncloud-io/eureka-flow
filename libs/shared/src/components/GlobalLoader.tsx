import { createPortal } from 'react-dom';

import { useLoaderStore } from '../hooks/useGlobalLoader';

/**
 * Full-screen loading overlay rendered via portal
 * Uses the global loader store for visibility control
 */
export const GlobalLoader = (): JSX.Element | null => {
    const isLoading = useLoaderStore(state => state.isLoading);

    if (!isLoading) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
            <div className="w-8 h-8 border-2 border-border/40 border-t-primary rounded-full animate-spin" />
        </div>,
        document.body
    );
};
