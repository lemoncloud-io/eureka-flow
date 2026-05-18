import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT = 767;
const MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT}px)`;

const hasDesktopOverride = () => new URLSearchParams(window.location.search).get('desktop') === '1';

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
