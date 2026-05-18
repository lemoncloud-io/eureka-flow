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

/** Update a stage inside all item caches (list + detail) */
const patchStageInCache = (
    qc: ReturnType<typeof useQueryClient>,
    stageId: string,
    updater: (stage: Stage) => Stage
) => {
    const mapStages = (stages: Stage[]) => stages.map(s => (s.id === stageId ? updater(s) : s));

    // Find parent item BEFORE mutating
    const listData = qc.getQueryData<ProcessApiListResponse<Item>>(itemKeys.lists());
    const parentItemId = listData?.data.find(item => item.stages.some(s => s.id === stageId))?.id;

    // Update list cache
    qc.setQueryData<ProcessApiListResponse<Item>>(itemKeys.lists(), old => {
        if (!old) return old;
        return { ...old, data: old.data.map(item => ({ ...item, stages: mapStages(item.stages) })) };
    });

    // Update detail cache
    if (parentItemId) {
        qc.setQueryData<ProcessApiResponse<Item>>(itemKeys.detail(parentItemId), old => {
            if (!old) return old;
            return { ...old, data: { ...old.data, stages: mapStages(old.data.stages) } };
        });
    }
};

/** Snapshot all item caches (list + details) for rollback */
const snapshotItemCaches = (qc: ReturnType<typeof useQueryClient>) =>
    qc.getQueriesData<unknown>({ queryKey: itemKeys.all });

/** Restore item caches from snapshot */
const restoreItemCaches = (qc: ReturnType<typeof useQueryClient>, snapshot: ReturnType<typeof snapshotItemCaches>) => {
    snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
};

export const useUpdateStageMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: UpdateStageInput }) => processApi.stages.update(id, input),
        onMutate: async ({ id, input }) => {
            await qc.cancelQueries({ queryKey: itemKeys.all });
            const prev = snapshotItemCaches(qc);
            patchStageInCache(qc, id, s => ({ ...s, ...input }) as Stage);
            return { prev };
        },
        onError: (_, __, ctx) => {
            if (ctx?.prev) restoreItemCaches(qc, ctx.prev);
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
            const prev = snapshotItemCaches(qc);
            const now = Date.now();
            patchStageInCache(qc, id, s => ({
                ...s,
                status: input.status,
                ...(input.status === 'done' ? { completedAt: now, completedByActorId: input.actorId } : {}),
            }));
            return { prev };
        },
        onError: (_, __, ctx) => {
            if (ctx?.prev) restoreItemCaches(qc, ctx.prev);
        },
    });
};

export const useAddNoteMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ stageId, input }: { stageId: string; input: CreateNoteInput }) =>
            processApi.stages.addNote(stageId, input),
        onSuccess: (result, { stageId }) => {
            patchStageInCache(qc, stageId, s => ({ ...s, notes: [...s.notes, result.data] }));
        },
    });
};

export const useAddTaskMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ stageId, input }: { stageId: string; input: CreateTaskInput }) =>
            processApi.stages.addTask(stageId, input),
        onSuccess: (result, { stageId }) => {
            patchStageInCache(qc, stageId, s => ({ ...s, tasks: [...s.tasks, result.data] }));
        },
    });
};

export const useChangeTaskStatusMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: ChangeStatusInput }) =>
            processApi.tasks.changeStatus(id, input),
        onSuccess: result => {
            const task = result.data;
            const listData = qc.getQueryData<ProcessApiListResponse<Item>>(itemKeys.lists());
            if (!listData) return;
            for (const item of listData.data) {
                for (const stage of item.stages) {
                    if (stage.tasks.some(t => t.id === task.id)) {
                        patchStageInCache(qc, stage.id, s => ({
                            ...s,
                            tasks: s.tasks.map(t => (t.id === task.id ? task : t)),
                        }));
                        return;
                    }
                }
            }
        },
    });
};

export const useAddTaskNoteMutation = () => {
    return useMutation({
        mutationFn: ({ taskId, input }: { taskId: string; input: CreateNoteInput }) =>
            processApi.tasks.addNote(taskId, input),
    });
};

export const useResolveNoteMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, resolvedByActorId }: { id: string; resolvedByActorId?: string }) =>
            processApi.notes.resolve(id, { resolvedByActorId }),
        onSuccess: result => {
            const note = result.data;
            if (!note.stageId) return;
            patchStageInCache(qc, note.stageId, s => ({
                ...s,
                notes: s.notes.map(n => (n.id === note.id ? note : n)),
            }));
        },
    });
};

export const useReopenNoteMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => processApi.notes.reopen(id),
        onSuccess: result => {
            const note = result.data;
            if (!note.stageId) return;
            patchStageInCache(qc, note.stageId, s => ({
                ...s,
                notes: s.notes.map(n => (n.id === note.id ? note : n)),
            }));
        },
    });
};
