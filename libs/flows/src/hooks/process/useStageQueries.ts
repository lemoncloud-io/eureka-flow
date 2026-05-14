import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { itemKeys, stageKeys } from './keys';
import { processApi } from '../../api/process';

import type { ChangeStatusInput, CreateNoteInput, CreateTaskInput, UpdateStageInput } from '../../types/process';

export const useStage = (id: string | null) => {
    return useQuery({
        queryKey: stageKeys.detail(id ?? ''),
        queryFn: () => processApi.stages.get(id!),
        enabled: !!id,
    });
};

export const useUpdateStageMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: UpdateStageInput }) => processApi.stages.update(id, input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: itemKeys.all });
        },
    });
};

export const useChangeStageStatusMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: ChangeStatusInput }) =>
            processApi.stages.changeStatus(id, input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: itemKeys.all });
        },
    });
};

export const useAddNoteMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ stageId, input }: { stageId: string; input: CreateNoteInput }) =>
            processApi.stages.addNote(stageId, input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: itemKeys.all });
        },
    });
};

export const useAddTaskMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ stageId, input }: { stageId: string; input: CreateTaskInput }) =>
            processApi.stages.addTask(stageId, input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: itemKeys.all });
        },
    });
};

export const useChangeTaskStatusMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: ChangeStatusInput }) =>
            processApi.tasks.changeStatus(id, input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: itemKeys.all });
        },
    });
};

export const useAddTaskNoteMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ taskId, input }: { taskId: string; input: CreateNoteInput }) =>
            processApi.tasks.addNote(taskId, input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: itemKeys.all });
        },
    });
};

export const useResolveNoteMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, resolvedByActorId }: { id: string; resolvedByActorId?: string }) =>
            processApi.notes.resolve(id, { resolvedByActorId }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: itemKeys.all });
        },
    });
};

export const useReopenNoteMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => processApi.notes.reopen(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: itemKeys.all });
        },
    });
};
