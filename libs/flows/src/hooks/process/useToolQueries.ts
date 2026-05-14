import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { toolKeys } from './keys';
import { processApi } from '../../api/process';

import type { CreateToolInput, Tool } from '../../types/process';

export const useTools = () => {
    return useQuery({
        queryKey: toolKeys.lists(),
        queryFn: () => processApi.tools.list(),
        staleTime: 60_000,
    });
};

export const useCreateToolMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: CreateToolInput) => processApi.tools.create(input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: toolKeys.lists() });
        },
    });
};

export const useUpdateToolMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: Partial<Tool> }) => processApi.tools.update(id, input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: toolKeys.lists() });
        },
    });
};

export const useDeactivateToolMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => processApi.tools.deactivate(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: toolKeys.lists() });
        },
    });
};

export const useActivateToolMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => processApi.tools.activate(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: toolKeys.lists() });
        },
    });
};
