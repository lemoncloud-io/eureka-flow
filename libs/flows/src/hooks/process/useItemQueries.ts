import { useEffect, useRef } from 'react';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { itemKeys, stageKeys } from './keys';
import { processApi } from '../../api/process';

import type {
    CreateItemInput,
    Item,
    ItemListParams,
    ProcessApiListResponse,
    ProcessApiResponse,
    Stage,
    UpdateItemInput,
} from '../../types/process';

export const useItems = (params?: ItemListParams) => {
    return useQuery({
        queryKey: itemKeys.lists(params as Record<string, unknown>),
        queryFn: () => processApi.items.list(params),
        staleTime: 30_000,
    });
};

export const useItem = (id: string | null) => {
    return useQuery({
        queryKey: itemKeys.detail(id ?? ''),
        queryFn: () => processApi.items.get(id!),
        enabled: !!id,
        staleTime: 30_000,
    });
};

/**
 * Hydrate item's stale stage$$ snapshot with fresh stage data.
 * Server's items.get returns a denormalized stage snapshot from creation time.
 * This hook fetches each stage individually and patches the item cache.
 */
export const useHydrateItemStages = (item: Item | undefined) => {
    const qc = useQueryClient();
    const hydratedRef = useRef<string | null>(null);
    const itemId = item?.id;
    const stageIds = item?.stages.map(s => s.id) ?? [];
    const stageIdsKey = stageIds.join(',');
    const stageQueries = useQueries({
        queries: stageIds.map(id => ({
            queryKey: stageKeys.detail(id),
            queryFn: () => processApi.stages.get(id),
            staleTime: 30_000,
            enabled: !!item && hydratedRef.current !== item.id,
        })),
    });

    const allDone = stageQueries.length > 0 && stageQueries.every(q => q.isSuccess);

    useEffect(() => {
        if (!itemId || !allDone || hydratedRef.current === itemId) return;
        hydratedRef.current = itemId;

        // Read fresh stages from query cache
        const freshStages = stageIds
            .map(id => qc.getQueryData<ProcessApiResponse<Stage>>(stageKeys.detail(id))?.data)
            .filter((s): s is Stage => !!s);

        if (freshStages.length === 0) return;

        const patchItem = (old: Item): Item => ({
            ...old,
            stages: old.stages.map(s => freshStages.find(f => f.id === s.id) ?? s),
        });

        qc.setQueryData<ProcessApiResponse<Item>>(itemKeys.detail(itemId), old => {
            if (!old) return old;
            return { ...old, data: patchItem(old.data) };
        });

        const queries = qc.getQueryCache().findAll({ queryKey: itemKeys.lists() });
        queries.forEach(query => {
            qc.setQueryData<ProcessApiListResponse<Item>>(query.queryKey, old => {
                if (!old) return old;
                return { ...old, data: old.data.map(i => (i.id === itemId ? patchItem(i) : i)) };
            });
        });
    }, [itemId, allDone, qc, stageIdsKey]);
};

/**
 * Hydrate ALL items' stages from the list cache.
 * Runs once after items list loads — fetches every stage in parallel.
 */
export const useHydrateAllItemStages = (items: Item[] | undefined) => {
    const qc = useQueryClient();
    const hydratedRef = useRef('');

    const allStageIds = items?.flatMap(item => item.stages.map(s => s.id)) ?? [];
    const stageIdsKey = allStageIds.join(',');

    const stageQueries = useQueries({
        queries: allStageIds.map(id => ({
            queryKey: stageKeys.detail(id),
            queryFn: () => processApi.stages.get(id),
            staleTime: 30_000,
            enabled: !!items && items.length > 0 && hydratedRef.current !== stageIdsKey,
        })),
    });

    const allDone = stageQueries.length > 0 && stageQueries.every(q => q.isSuccess);

    useEffect(() => {
        if (!stageIdsKey || !allDone || hydratedRef.current === stageIdsKey) return;
        hydratedRef.current = stageIdsKey;

        const freshStages = allStageIds
            .map(id => qc.getQueryData<ProcessApiResponse<Stage>>(stageKeys.detail(id))?.data)
            .filter((s): s is Stage => !!s);

        if (freshStages.length === 0) return;

        const stageMap = new Map(freshStages.map(s => [s.id, s]));
        const patchItem = (item: Item): Item => ({
            ...item,
            stages: item.stages.map(s => stageMap.get(s.id) ?? s),
        });

        const queries = qc.getQueryCache().findAll({ queryKey: itemKeys.lists() });
        queries.forEach(query => {
            qc.setQueryData<ProcessApiListResponse<Item>>(query.queryKey, old => {
                if (!old) return old;
                return { ...old, data: old.data.map(patchItem) };
            });
        });
    }, [stageIdsKey, allDone, qc, allStageIds]);
};

export const useCreateItemMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: CreateItemInput) => processApi.items.create(input),
        onSuccess: result => {
            qc.invalidateQueries({ queryKey: itemKeys.lists() });
            qc.setQueryData(itemKeys.detail(result.data.id), result);
        },
    });
};

export const useUpdateItemMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: UpdateItemInput }) => processApi.items.update(id, input),
        onMutate: async ({ id, input }) => {
            await Promise.all([
                qc.cancelQueries({ queryKey: itemKeys.detail(id) }),
                qc.cancelQueries({ queryKey: itemKeys.lists() }),
            ]);
            const prevDetail = qc.getQueryData<ProcessApiResponse<Item>>(itemKeys.detail(id));

            const queries = qc.getQueryCache().findAll({ queryKey: itemKeys.lists() });
            const prevLists = queries.map(q => ({ queryKey: q.queryKey, data: q.state.data }));

            const optimistic = (item: Item): Item => {
                const { meta, ...rest } = input;
                return { ...item, ...rest, ...(meta ? { $meta: meta } : {}) };
            };
            qc.setQueryData<ProcessApiResponse<Item>>(itemKeys.detail(id), old => {
                if (!old) return old;
                return { ...old, data: optimistic(old.data) };
            });

            queries.forEach(query => {
                qc.setQueryData<ProcessApiListResponse<Item>>(query.queryKey, old => {
                    if (!old) return old;
                    return { ...old, data: old.data.map(i => (i.id === id ? optimistic(i) : i)) };
                });
            });

            return { prevDetail, prevLists };
        },
        onError: (_, { id }, ctx) => {
            if (ctx?.prevDetail) qc.setQueryData(itemKeys.detail(id), ctx.prevDetail);
            if (ctx?.prevLists) {
                ctx.prevLists.forEach(({ queryKey, data }) => {
                    qc.setQueryData(queryKey, data);
                });
            }
        },
        onSuccess: (result, { id }) => {
            qc.setQueryData(itemKeys.detail(id), result);
            qc.invalidateQueries({ queryKey: itemKeys.lists() });
        },
    });
};

export const useDeleteItemMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => processApi.items.remove(id),
        onMutate: async id => {
            await qc.cancelQueries({ queryKey: itemKeys.lists() });

            const queries = qc.getQueryCache().findAll({ queryKey: itemKeys.lists() });
            const prevLists = queries.map(q => ({ queryKey: q.queryKey, data: q.state.data }));

            queries.forEach(query => {
                qc.setQueryData<ProcessApiListResponse<Item>>(query.queryKey, old => {
                    if (!old) return old;
                    return { ...old, data: old.data.filter(i => i.id !== id) };
                });
            });
            qc.removeQueries({ queryKey: itemKeys.detail(id) });
            return { prevLists };
        },
        onError: (_, __, ctx) => {
            if (ctx?.prevLists) {
                ctx.prevLists.forEach(({ queryKey, data }) => {
                    qc.setQueryData(queryKey, data);
                });
            }
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: itemKeys.lists() });
        },
    });
};
