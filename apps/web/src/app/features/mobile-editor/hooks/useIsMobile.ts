import { useEffect, useState } from 'react';

import { hasDesktopOverride } from './desktopOverride';

const MOBILE_BREAKPOINT = 767;
const MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT}px)`;

export const useIsMobile = (): boolean => {
    const [isMobile, setIsMobile] = useState(() => !hasDesktopOverride() && window.matchMedia(MEDIA_QUERY).matches);

    useEffect(() => {
        if (hasDesktopOverride()) return;
        const mql = window.matchMedia(MEDIA_QUERY);
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mql.addEventListener('change', handler);
        return () => mql.removeEventListener('change', handler);
    }, []);

    return isMobile;
};

/** Raw device-size check — ignores `?desktop=1` override. Use to detect mobile devices forced into desktop view. */
export const useIsMobileDevice = (): boolean => {
    const [isMobileDevice, setIsMobileDevice] = useState(() => window.matchMedia(MEDIA_QUERY).matches);

    useEffect(() => {
        const mql = window.matchMedia(MEDIA_QUERY);
        const handler = (e: MediaQueryListEvent) => setIsMobileDevice(e.matches);
        mql.addEventListener('change', handler);
        return () => mql.removeEventListener('change', handler);
    }, []);

    return isMobileDevice;
};
