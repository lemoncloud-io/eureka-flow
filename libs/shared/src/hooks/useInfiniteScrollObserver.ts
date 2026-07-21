import { useEffect, useRef } from 'react';

interface InfiniteScrollOptions {
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => void;
    /**
     * Re-attach the observer when this flips — e.g. when the sentinel mounts only after data
     * loads, or unmounts on an empty/no-results branch. Defaults to always enabled.
     */
    enabled?: boolean;
}

/**
 * Attach the returned ref to a sentinel element at the end of an infinite list; when it scrolls
 * into view the next page is fetched. A ref mirror keeps the latest query state readable inside
 * the observer callback without re-subscribing on every render.
 */
export const useInfiniteScrollObserver = ({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    enabled = true,
}: InfiniteScrollOptions) => {
    const sentinelRef = useRef<HTMLDivElement>(null);
    const stateRef = useRef({ hasNextPage, isFetchingNextPage, fetchNextPage });
    stateRef.current = { hasNextPage, isFetchingNextPage, fetchNextPage };

    useEffect(() => {
        const el = sentinelRef.current;
        if (!el || !enabled) return;
        const observer = new IntersectionObserver(
            entries => {
                const { hasNextPage: has, isFetchingNextPage: fetching, fetchNextPage: fetch } = stateRef.current;
                if (entries[0]?.isIntersecting && has && !fetching) fetch();
            },
            { threshold: 0.1 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [enabled]);

    return sentinelRef;
};
