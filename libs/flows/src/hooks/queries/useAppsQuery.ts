import { useInfiniteQuery } from '@tanstack/react-query';

import { appsKeys } from './keys';
import { listAppsSeo } from '../../api';

/**
 * Infinite query for the public Apps gallery — pages the SEO list.
 * `GET /_seo_/apps/0/list?page=N` (public, unauthenticated)
 *
 * Stops paging once a page comes back empty or the accumulated count reaches `total`.
 */
export const useAppsListInfiniteQuery = () =>
    useInfiniteQuery({
        queryKey: appsKeys.list(),
        queryFn: ({ pageParam }) => listAppsSeo(pageParam),
        initialPageParam: 0,
        getNextPageParam: (lastPage, allPages) => {
            const loaded = allPages.reduce((sum, page) => sum + page.list.length, 0);
            const total = lastPage.total ?? loaded;
            if (lastPage.list.length === 0 || loaded >= total) return undefined;
            return allPages.length;
        },
    });
