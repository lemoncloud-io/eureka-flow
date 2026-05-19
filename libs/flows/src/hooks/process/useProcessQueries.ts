import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { itemKeys, processKeys } from './keys';
import { processApi } from '../../api/process';

import type {
    CreateItemInput,
    CreateProcessInput,
    Item,
    Process,
    ProcessApiListResponse,
    ProcessApiResponse,
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
            qc.setQueryData(processKeys.detail(result.data.id), result);
        },
    });
};

export const useUpdateProcessMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: UpdateProcessInput }) =>
            processApi.processes.update(id, input),
        onMutate: async ({ id, input }) => {
            await Promise.all([
                qc.cancelQueries({ queryKey: processKeys.detail(id) }),
                qc.cancelQueries({ queryKey: processKeys.lists() }),
            ]);
            const prevDetail = qc.getQueryData<ProcessApiResponse<Process>>(processKeys.detail(id));
            const prevList = qc.getQueryData<ProcessApiListResponse<Process>>(processKeys.lists());
            qc.setQueryData<ProcessApiResponse<Process>>(processKeys.detail(id), old => {
                if (!old) return old;
                return { ...old, data: { ...old.data, ...input } };
            });
            qc.setQueryData<ProcessApiListResponse<Process>>(processKeys.lists(), old => {
                if (!old) return old;
                return { ...old, data: old.data.map(p => (p.id === id ? { ...p, ...input } : p)) };
            });
            return { prevDetail, prevList };
        },
        onError: (_, { id }, ctx) => {
            if (ctx?.prevDetail) qc.setQueryData(processKeys.detail(id), ctx.prevDetail);
            if (ctx?.prevList) qc.setQueryData(processKeys.lists(), ctx.prevList);
        },
        onSuccess: (result, { id }) => {
            qc.setQueryData(processKeys.detail(id), result);
            qc.setQueryData<ProcessApiListResponse<Process>>(processKeys.lists(), old => {
                if (!old) return old;
                return { ...old, data: old.data.map(p => (p.id === id ? result.data : p)) };
            });
        },
    });
};

export const useDeleteProcessMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => processApi.processes.remove(id),
        onMutate: async id => {
            await qc.cancelQueries({ queryKey: processKeys.lists() });
            const prev = qc.getQueryData<ProcessApiListResponse<Process>>(processKeys.lists());
            qc.setQueryData<ProcessApiListResponse<Process>>(processKeys.lists(), old => {
                if (!old) return old;
                return { ...old, data: old.data.filter(p => p.id !== id) };
            });
            qc.removeQueries({ queryKey: processKeys.detail(id) });
            return { prev };
        },
        onError: (_, __, ctx) => {
            if (ctx?.prev) qc.setQueryData(processKeys.lists(), ctx.prev);
        },
    });
};

export const useApplyProcessMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ processId, input }: { processId: string; input: CreateItemInput }) =>
            processApi.processes.apply(processId, input),
        onSuccess: result => {
            qc.setQueryData<ProcessApiListResponse<Item>>(itemKeys.lists(), old => {
                if (!old) return old;
                return { ...old, data: [...old.data, result.data] };
            });
            qc.setQueryData(itemKeys.detail(result.data.id), result);
        },
    });
};
