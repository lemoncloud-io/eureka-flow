import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { itemKeys, stageKeys } from './keys';
import { processApi } from '../../api/process';

import type {
    ChangeStatusInput,
    CreateNoteInput,
    CreateTaskInput,
    Item,
    ProcessApiListResponse,
    ProcessApiResponse,
    Stage,
    UpdateStageInput,
} from '../../types/process';

export const useStage = (id: string | null) => {
    return useQuery({
        queryKey: stageKeys.detail(id ?? ''),
        queryFn: () => processApi.stages.get(id!),
        enabled: !!id,
    });
};

/** Helper: update a stage inside all item caches */
const updateStageInItems = (
    qc: ReturnType<typeof useQueryClient>,
    stageId: string,
    updater: (stage: Stage) => Stage
) => {
    qc.setQueriesData<ProcessApiListResponse<Item>>({ queryKey: itemKeys.all }, old => {
        if (!old) return old;
        return {
            ...old,
            data: old.data.map(item => ({
                ...item,
                stages: item.stages.map(s => (s.id === stageId ? updater(s) : s)),
            })),
        };
    });
};

/** Helper: update a stage inside a single item detail cache */
const updateStageInItemDetail = (
    qc: ReturnType<typeof useQueryClient>,
    stageId: string,
    updater: (stage: Stage) => Stage
) => {
    // Find which item contains this stage
    const listData = qc.getQueryData<ProcessApiListResponse<Item>>(itemKeys.lists());
    const parentItem = listData?.data.find(item => item.stages.some(s => s.id === stageId));
    if (!parentItem) return;

    qc.setQueryData<ProcessApiResponse<Item>>(itemKeys.detail(parentItem.id), old => {
        if (!old) return old;
        return {
            ...old,
            data: {
                ...old.data,
                stages: old.data.stages.map(s => (s.id === stageId ? updater(s) : s)),
            },
        };
    });
};

export const useUpdateStageMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: UpdateStageInput }) => processApi.stages.update(id, input),
        onMutate: async ({ id, input }) => {
            await qc.cancelQueries({ queryKey: itemKeys.all });
            const prev = qc.getQueriesData({ queryKey: itemKeys.all });
            updateStageInItems(qc, id, s => ({ ...s, ...input }) as Stage);
            updateStageInItemDetail(qc, id, s => ({ ...s, ...input }) as Stage);
            return { prev };
        },
        onError: (_, __, ctx) => {
            ctx?.prev?.forEach(([key, data]) => qc.setQueryData(key, data));
        },
        onSettled: () => {
            qc.invalidateQueries({ queryKey: itemKeys.all });
        },
    });
};

export const useChangeStageStatusMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: ChangeStatusInput }) =>
            processApi.stages.changeStatus(id, input),
        onMutate: async ({ id, input }) => {
            await qc.cancelQueries({ queryKey: itemKeys.all });
            const prev = qc.getQueriesData({ queryKey: itemKeys.all });
            const now = Date.now();
            updateStageInItems(qc, id, s => ({
                ...s,
                status: input.status,
                ...(input.status === 'done' ? { completedAt: now, completedByActorId: input.actorId } : {}),
            }));
            updateStageInItemDetail(qc, id, s => ({
                ...s,
                status: input.status,
                ...(input.status === 'done' ? { completedAt: now, completedByActorId: input.actorId } : {}),
            }));
            return { prev };
        },
        onError: (_, __, ctx) => {
            ctx?.prev?.forEach(([key, data]) => qc.setQueryData(key, data));
        },
        onSettled: () => {
            qc.invalidateQueries({ queryKey: itemKeys.all });
        },
    });
};

export const useAddNoteMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ stageId, input }: { stageId: string; input: CreateNoteInput }) =>
            processApi.stages.addNote(stageId, input),
        onSuccess: (result, { stageId }) => {
            // Push note into stage cache
            updateStageInItems(qc, stageId, s => ({
                ...s,
                notes: [...s.notes, result.data],
            }));
            updateStageInItemDetail(qc, stageId, s => ({
                ...s,
                notes: [...s.notes, result.data],
            }));
        },
        onSettled: () => {
            qc.invalidateQueries({ queryKey: itemKeys.all });
        },
    });
};

export const useAddTaskMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ stageId, input }: { stageId: string; input: CreateTaskInput }) =>
            processApi.stages.addTask(stageId, input),
        onSuccess: (result, { stageId }) => {
            updateStageInItems(qc, stageId, s => ({
                ...s,
                tasks: [...s.tasks, result.data],
            }));
            updateStageInItemDetail(qc, stageId, s => ({
                ...s,
                tasks: [...s.tasks, result.data],
            }));
        },
        onSettled: () => {
            qc.invalidateQueries({ queryKey: itemKeys.all });
        },
    });
};

export const useChangeTaskStatusMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: ChangeStatusInput }) =>
            processApi.tasks.changeStatus(id, input),
        onSettled: () => {
            qc.invalidateQueries({ queryKey: itemKeys.all });
        },
    });
};

export const useAddTaskNoteMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ taskId, input }: { taskId: string; input: CreateNoteInput }) =>
            processApi.tasks.addNote(taskId, input),
        onSettled: () => {
            qc.invalidateQueries({ queryKey: itemKeys.all });
        },
    });
};

export const useResolveNoteMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, resolvedByActorId }: { id: string; resolvedByActorId?: string }) =>
            processApi.notes.resolve(id, { resolvedByActorId }),
        onSettled: () => {
            qc.invalidateQueries({ queryKey: itemKeys.all });
        },
    });
};

export const useReopenNoteMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => processApi.notes.reopen(id),
        onSettled: () => {
            qc.invalidateQueries({ queryKey: itemKeys.all });
        },
    });
};
