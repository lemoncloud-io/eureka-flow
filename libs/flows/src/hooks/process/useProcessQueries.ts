import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { itemKeys, processKeys } from './keys';
import { processApi } from '../../api/process';

import type {
    CreateItemInput,
    CreateProcessInput,
    Process,
    ProcessApiListResponse,
    UpdateProcessInput,
} from '../../types/process';

export const useProcesses = () => {
    return useQuery({
        queryKey: processKeys.lists(),
        queryFn: () => processApi.processes.list(),
        staleTime: 60_000,
    });
};

export const useProcess = (id: string | null) => {
    return useQuery({
        queryKey: processKeys.detail(id ?? ''),
        queryFn: () => processApi.processes.get(id!),
        enabled: !!id,
        staleTime: 60_000,
    });
};

export const useCreateProcessMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: CreateProcessInput) => processApi.processes.create(input),
        onSuccess: result => {
            qc.setQueryData<ProcessApiListResponse<Process>>(processKeys.lists(), old => {
                if (!old) return old;
                return { ...old, data: [...old.data, result.data] };
            });
        },
        onSettled: () => {
            qc.invalidateQueries({ queryKey: processKeys.lists() });
        },
    });
};

export const useUpdateProcessMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: UpdateProcessInput }) =>
            processApi.processes.update(id, input),
        onMutate: async ({ id, input }) => {
            await qc.cancelQueries({ queryKey: processKeys.detail(id) });
            const prev = qc.getQueryData(processKeys.detail(id));
            qc.setQueryData(processKeys.detail(id), (old: any) => {
                if (!old) return old;
                return { ...old, data: { ...old.data, ...input } };
            });
            return { prev };
        },
        onError: (_, { id }, ctx) => {
            if (ctx?.prev) qc.setQueryData(processKeys.detail(id), ctx.prev);
        },
        onSettled: (_, __, { id }) => {
            qc.invalidateQueries({ queryKey: processKeys.detail(id) });
            qc.invalidateQueries({ queryKey: processKeys.lists() });
        },
    });
};

export const useDeleteProcessMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => processApi.processes.remove(id),
        onMutate: async id => {
            await qc.cancelQueries({ queryKey: processKeys.lists() });
            const prev = qc.getQueryData(processKeys.lists());
            qc.setQueryData<ProcessApiListResponse<Process>>(processKeys.lists(), old => {
                if (!old) return old;
                return { ...old, data: old.data.filter(p => p.id !== id) };
            });
            return { prev };
        },
        onError: (_, __, ctx) => {
            if (ctx?.prev) qc.setQueryData(processKeys.lists(), ctx.prev);
        },
        onSettled: () => {
            qc.invalidateQueries({ queryKey: processKeys.lists() });
        },
    });
};

export const useApplyProcessMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ processId, input }: { processId: string; input: CreateItemInput }) =>
            processApi.processes.apply(processId, input),
        onSettled: () => {
            qc.invalidateQueries({ queryKey: itemKeys.lists() });
        },
    });
};
