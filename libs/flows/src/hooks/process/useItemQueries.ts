import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { itemKeys } from './keys';
import { processApi } from '../../api/process';

import type { CreateItemInput, Item, ProcessApiListResponse, ProcessApiResponse } from '../../types/process';

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
            qc.setQueryData<ProcessApiListResponse<Item>>(itemKeys.lists(), old => {
                if (!old) return old;
                return { ...old, data: [...old.data, result.data] };
            });
            qc.setQueryData(itemKeys.detail(result.data.id), result);
        },
    });
};

export const useUpdateItemMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: Partial<Item> }) => processApi.items.update(id, input),
        onMutate: async ({ id, input }) => {
            await qc.cancelQueries({ queryKey: itemKeys.detail(id) });
            const prevDetail = qc.getQueryData<ProcessApiResponse<Item>>(itemKeys.detail(id));
            const prevList = qc.getQueryData<ProcessApiListResponse<Item>>(itemKeys.lists());
            qc.setQueryData<ProcessApiResponse<Item>>(itemKeys.detail(id), old => {
                if (!old) return old;
                return { ...old, data: { ...old.data, ...input } };
            });
            qc.setQueryData<ProcessApiListResponse<Item>>(itemKeys.lists(), old => {
                if (!old) return old;
                return { ...old, data: old.data.map(i => (i.id === id ? { ...i, ...input } : i)) };
            });
            return { prevDetail, prevList };
        },
        onError: (_, { id }, ctx) => {
            if (ctx?.prevDetail) qc.setQueryData(itemKeys.detail(id), ctx.prevDetail);
            if (ctx?.prevList) qc.setQueryData(itemKeys.lists(), ctx.prevList);
        },
        onSuccess: (result, { id }) => {
            qc.setQueryData(itemKeys.detail(id), result);
            qc.setQueryData<ProcessApiListResponse<Item>>(itemKeys.lists(), old => {
                if (!old) return old;
                return { ...old, data: old.data.map(i => (i.id === id ? result.data : i)) };
            });
        },
    });
};

export const useDeleteItemMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => processApi.items.remove(id),
        onMutate: async id => {
            await qc.cancelQueries({ queryKey: itemKeys.lists() });
            const prev = qc.getQueryData<ProcessApiListResponse<Item>>(itemKeys.lists());
            qc.setQueryData<ProcessApiListResponse<Item>>(itemKeys.lists(), old => {
                if (!old) return old;
                return { ...old, data: old.data.filter(i => i.id !== id) };
            });
            qc.removeQueries({ queryKey: itemKeys.detail(id) });
            return { prev };
        },
        onError: (_, __, ctx) => {
            if (ctx?.prev) qc.setQueryData(itemKeys.lists(), ctx.prev);
        },
    });
};
