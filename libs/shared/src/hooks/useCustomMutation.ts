import { useMutation } from '@tanstack/react-query';

import type { UseMutationOptions, UseMutationResult } from '@tanstack/react-query';

/**
 * Type-safe mutation configuration
 */
export type MutationConfig<TData, TError, TVariables> = Omit<
    UseMutationOptions<TData, TError, TVariables>,
    'mutationFn'
>;

/**
 * Type-safe wrapper around useMutation
 *
 * @template TData - API response data type
 * @template TError - API error type
 * @template TVariables - Variables passed to mutation function
 *
 * @param mutationFn - API call function
 * @param config - mutation configuration (onSuccess, onError, etc.)
 */
export const useCustomMutation = <TData, TError, TVariables>(
    mutationFn: (variables: TVariables) => Promise<TData>,
    config?: MutationConfig<TData, TError, TVariables>
): UseMutationResult<TData, TError, TVariables> => {
    return useMutation({
        mutationFn,
        ...config,
    });
};
