import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { actorKeys } from './keys';
import { processApi } from '../../api/process';

import type { Actor, CreateActorInput, ProcessApiListResponse } from '../../types/process';

export const useActors = (options?: { staleTime?: number }) => {
    return useQuery({
        queryKey: actorKeys.lists(),
        queryFn: () => processApi.actors.list(),
        staleTime: options?.staleTime !== undefined ? options.staleTime : 60_000,
    });
};

export const useCreateActorMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: CreateActorInput) => processApi.actors.create(input),
        onSuccess: result => {
            qc.setQueryData<ProcessApiListResponse<Actor>>(actorKeys.lists(), old => {
                if (!old) return old;
                return { ...old, data: [...old.data, result.data] };
            });
        },
    });
};

export const useUpdateActorMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: Partial<Actor> }) => processApi.actors.update(id, input),
        onMutate: async ({ id, input }) => {
            await qc.cancelQueries({ queryKey: actorKeys.lists() });
            const prev = qc.getQueryData<ProcessApiListResponse<Actor>>(actorKeys.lists());
            qc.setQueryData<ProcessApiListResponse<Actor>>(actorKeys.lists(), old => {
                if (!old) return old;
                return { ...old, data: old.data.map(a => (a.id === id ? { ...a, ...input } : a)) };
            });
            return { prev };
        },
        onError: (_, __, ctx) => {
            if (ctx?.prev) qc.setQueryData(actorKeys.lists(), ctx.prev);
        },
        onSuccess: result => {
            qc.setQueryData<ProcessApiListResponse<Actor>>(actorKeys.lists(), old => {
                if (!old) return old;
                return { ...old, data: old.data.map(a => (a.id === result.data.id ? result.data : a)) };
            });
        },
    });
};

export const useDeactivateActorMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => processApi.actors.deactivate(id),
        onMutate: async id => {
            await qc.cancelQueries({ queryKey: actorKeys.lists() });
            const prev = qc.getQueryData<ProcessApiListResponse<Actor>>(actorKeys.lists());
            qc.setQueryData<ProcessApiListResponse<Actor>>(actorKeys.lists(), old => {
                if (!old) return old;
                return { ...old, data: old.data.map(a => (a.id === id ? { ...a, isActive: false } : a)) };
            });
            return { prev };
        },
        onError: (_, __, ctx) => {
            if (ctx?.prev) qc.setQueryData(actorKeys.lists(), ctx.prev);
        },
    });
};

export const useActivateActorMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => processApi.actors.activate(id),
        onMutate: async id => {
            await qc.cancelQueries({ queryKey: actorKeys.lists() });
            const prev = qc.getQueryData<ProcessApiListResponse<Actor>>(actorKeys.lists());
            qc.setQueryData<ProcessApiListResponse<Actor>>(actorKeys.lists(), old => {
                if (!old) return old;
                return { ...old, data: old.data.map(a => (a.id === id ? { ...a, isActive: true } : a)) };
            });
            return { prev };
        },
        onError: (_, __, ctx) => {
            if (ctx?.prev) qc.setQueryData(actorKeys.lists(), ctx.prev);
        },
    });
};
