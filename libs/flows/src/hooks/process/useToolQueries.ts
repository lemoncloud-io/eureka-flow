import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { toolKeys } from './keys';
import { processApi } from '../../api/process';

import type { CreateToolInput, ProcessApiListResponse, Tool } from '../../types/process';

export const useTools = () => {
    return useQuery({
        queryKey: toolKeys.lists(),
        queryFn: () => processApi.tools.list(),
        staleTime: 60_000,
    });
};

export const useCreateToolMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: CreateToolInput) => processApi.tools.create(input),
        onSuccess: result => {
            qc.setQueryData<ProcessApiListResponse<Tool>>(toolKeys.lists(), old => {
                if (!old) return old;
                return { ...old, data: [...old.data, result.data] };
            });
        },
    });
};

export const useUpdateToolMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: Partial<Tool> }) => processApi.tools.update(id, input),
        onMutate: async ({ id, input }) => {
            await qc.cancelQueries({ queryKey: toolKeys.lists() });
            const prev = qc.getQueryData<ProcessApiListResponse<Tool>>(toolKeys.lists());
            qc.setQueryData<ProcessApiListResponse<Tool>>(toolKeys.lists(), old => {
                if (!old) return old;
                return { ...old, data: old.data.map(t => (t.id === id ? { ...t, ...input } : t)) };
            });
            return { prev };
        },
        onError: (_, __, ctx) => {
            if (ctx?.prev) qc.setQueryData(toolKeys.lists(), ctx.prev);
        },
        onSuccess: result => {
            qc.setQueryData<ProcessApiListResponse<Tool>>(toolKeys.lists(), old => {
                if (!old) return old;
                return { ...old, data: old.data.map(t => (t.id === result.data.id ? result.data : t)) };
            });
        },
    });
};

export const useDeactivateToolMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => processApi.tools.deactivate(id),
        onMutate: async id => {
            await qc.cancelQueries({ queryKey: toolKeys.lists() });
            const prev = qc.getQueryData<ProcessApiListResponse<Tool>>(toolKeys.lists());
            qc.setQueryData<ProcessApiListResponse<Tool>>(toolKeys.lists(), old => {
                if (!old) return old;
                return { ...old, data: old.data.map(t => (t.id === id ? { ...t, isActive: false } : t)) };
            });
            return { prev };
        },
        onError: (_, __, ctx) => {
            if (ctx?.prev) qc.setQueryData(toolKeys.lists(), ctx.prev);
        },
    });
};

export const useActivateToolMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => processApi.tools.activate(id),
        onMutate: async id => {
            await qc.cancelQueries({ queryKey: toolKeys.lists() });
            const prev = qc.getQueryData<ProcessApiListResponse<Tool>>(toolKeys.lists());
            qc.setQueryData<ProcessApiListResponse<Tool>>(toolKeys.lists(), old => {
                if (!old) return old;
                return { ...old, data: old.data.map(t => (t.id === id ? { ...t, isActive: true } : t)) };
            });
            return { prev };
        },
        onError: (_, __, ctx) => {
            if (ctx?.prev) qc.setQueryData(toolKeys.lists(), ctx.prev);
        },
    });
};
