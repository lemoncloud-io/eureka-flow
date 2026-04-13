import { useEffect, useRef } from 'react';

import type { RefObject } from 'react';

export const useScrollRestore = (containerRef: RefObject<HTMLElement | null>, isSheetOpen: boolean): void => {
    const savedScrollTop = useRef(0);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        if (isSheetOpen) {
            savedScrollTop.current = el.scrollTop;
        } else {
            requestAnimationFrame(() => {
                el.scrollTop = savedScrollTop.current;
            });
        }
        // containerRef is a stable ref object — omit from deps
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSheetOpen]);
};
