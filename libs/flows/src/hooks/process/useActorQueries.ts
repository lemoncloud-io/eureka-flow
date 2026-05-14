import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { actorKeys } from './keys';
import { processApi } from '../../api/process';

import type { Actor, CreateActorInput } from '../../types/process';

export const useActors = () => {
    return useQuery({
        queryKey: actorKeys.lists(),
        queryFn: () => processApi.actors.list(),
        staleTime: 60_000,
    });
};

export const useCreateActorMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: CreateActorInput) => processApi.actors.create(input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: actorKeys.lists() });
        },
    });
};

export const useUpdateActorMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: Partial<Actor> }) => processApi.actors.update(id, input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: actorKeys.lists() });
        },
    });
};

export const useDeactivateActorMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => processApi.actors.deactivate(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: actorKeys.lists() });
        },
    });
};

export const useActivateActorMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => processApi.actors.activate(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: actorKeys.lists() });
        },
    });
};
