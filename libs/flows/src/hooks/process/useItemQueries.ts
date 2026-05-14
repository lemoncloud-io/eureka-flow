import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { itemKeys } from './keys';
import { processApi } from '../../api/process';

import type { CreateItemInput, Item } from '../../types/process';

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
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: CreateItemInput) => processApi.items.create(input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: itemKeys.lists() });
        },
    });
};

export const useUpdateItemMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: Partial<Item> }) => processApi.items.update(id, input),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: itemKeys.detail(id) });
            queryClient.invalidateQueries({ queryKey: itemKeys.lists() });
        },
    });
};

export const useDeleteItemMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => processApi.items.remove(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: itemKeys.lists() });
        },
    });
};
