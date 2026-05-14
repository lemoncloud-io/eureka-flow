import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { itemKeys, processKeys } from './keys';
import { processApi } from '../../api/process';

import type { CreateItemInput, CreateProcessInput, UpdateProcessInput } from '../../types/process';

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
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: CreateProcessInput) => processApi.processes.create(input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: processKeys.lists() });
        },
    });
};

export const useUpdateProcessMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: UpdateProcessInput }) =>
            processApi.processes.update(id, input),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: processKeys.detail(id) });
            queryClient.invalidateQueries({ queryKey: processKeys.lists() });
        },
    });
};

export const useDeleteProcessMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => processApi.processes.remove(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: processKeys.lists() });
        },
    });
};

export const useApplyProcessMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ processId, input }: { processId: string; input: CreateItemInput }) =>
            processApi.processes.apply(processId, input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: itemKeys.lists() });
        },
    });
};
