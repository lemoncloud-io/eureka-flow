import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { itemKeys } from './keys';
import { processApi } from '../../api/process';

import type { CreateItemInput, Item, ProcessApiListResponse } from '../../types/process';

export const useItems = () => {
    return useQuery({
        queryKey: itemKeys.lists(),
        queryFn: () => processApi.items.list(),
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

export const useCreateItemMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: CreateItemInput) => processApi.items.create(input),
        onSuccess: result => {
            // Push new item into list cache
            qc.setQueryData<ProcessApiListResponse<Item>>(itemKeys.lists(), old => {
                if (!old) return old;
                return { ...old, data: [...old.data, result.data] };
            });
        },
        onSettled: () => {
            qc.invalidateQueries({ queryKey: itemKeys.lists() });
        },
    });
};

export const useUpdateItemMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: Partial<Item> }) => processApi.items.update(id, input),
        onMutate: async ({ id, input }) => {
            await qc.cancelQueries({ queryKey: itemKeys.detail(id) });
            const prev = qc.getQueryData(itemKeys.detail(id));
            // Optimistic update detail cache
            qc.setQueryData(itemKeys.detail(id), (old: any) => {
                if (!old) return old;
                return { ...old, data: { ...old.data, ...input } };
            });
            return { prev };
        },
        onError: (_, { id }, ctx) => {
            if (ctx?.prev) qc.setQueryData(itemKeys.detail(id), ctx.prev);
        },
        onSettled: (_, __, { id }) => {
            qc.invalidateQueries({ queryKey: itemKeys.detail(id) });
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
            const prev = qc.getQueryData(itemKeys.lists());
            // Optimistic remove from list
            qc.setQueryData<ProcessApiListResponse<Item>>(itemKeys.lists(), old => {
                if (!old) return old;
                return { ...old, data: old.data.filter(i => i.id !== id) };
            });
            return { prev };
        },
        onError: (_, __, ctx) => {
            if (ctx?.prev) qc.setQueryData(itemKeys.lists(), ctx.prev);
        },
        onSettled: () => {
            qc.invalidateQueries({ queryKey: itemKeys.lists() });
        },
    });
};
