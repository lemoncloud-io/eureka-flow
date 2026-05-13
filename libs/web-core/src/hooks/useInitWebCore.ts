import { useEffect, useRef, useState } from 'react';

import { useWebCoreStore } from '../stores';

/**
 * Initialize webCore on mount. Returns true when ready.
 * StrictMode-safe via useRef guard.
 */
export const useInitWebCore = () => {
    const { initialize, isInitialized } = useWebCoreStore();
    const [localInitState, setLocalInitState] = useState<'idle' | 'initializing' | 'completed'>('idle');
    const hasInitialized = useRef(false);

    useEffect(() => {
        if (hasInitialized.current || localInitState !== 'idle') return;

        hasInitialized.current = true;
        setLocalInitState('initializing');

        const runInitialization = async () => {
            try {
                await initialize();
                setLocalInitState('completed');
            } catch (error) {
                console.error('[WebCore] Initialization failed:', error);
                setLocalInitState('completed');
            }
        };

        runInitialization();
    }, [initialize, localInitState]);

    return isInitialized && localInitState === 'completed';
};
