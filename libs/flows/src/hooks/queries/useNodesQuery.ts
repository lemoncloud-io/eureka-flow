import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { flowsKeys } from './keys';
import { nodesKeys } from './keys';
import {
    createNode,
    deleteNode,
    getNode,
    listNodes,
    updateNode,
    updateNodeConfig,
    updateNodeLabel,
    updateNodePosition,
    updateNodeStatus,
} from '../../api';

import type { NodeBody, NodeView, Position } from '../../types';

/**
 * Query hook for listing nodes by flow ID
 */
export const useNodesListQuery = (flowId: string | null) => {
    return useQuery({
        queryKey: nodesKeys.listByFlow(flowId ?? ''),
        queryFn: () => listNodes(flowId!),
        enabled: !!flowId,
    });
};

/**
 * Query hook for getting a single node by ID
 */
export const useNodeQuery = (nodeId: string | null) => {
    return useQuery({
        queryKey: nodesKeys.detail(nodeId ?? ''),
        queryFn: () => getNode(nodeId!),
        enabled: !!nodeId,
    });
};

/**
 * Mutation hook for creating a new node
 */
export const useCreateNodeMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (body: NodeBody) => createNode(body),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: nodesKeys.listByFlow(variables.flowId) });
            queryClient.invalidateQueries({ queryKey: flowsKeys.snapshot(variables.flowId) });
        },
    });
};

/**
 * Mutation hook for updating a node
 */
export const useUpdateNodeMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, body, flowId: _flowId }: { id: string; body: Partial<NodeView>; flowId?: string }) =>
            updateNode(id, body),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: nodesKeys.detail(variables.id) });
            if (variables.flowId) {
                queryClient.invalidateQueries({ queryKey: nodesKeys.listByFlow(variables.flowId) });
                queryClient.invalidateQueries({ queryKey: flowsKeys.snapshot(variables.flowId) });
            }
        },
    });
};

/**
 * Mutation hook for deleting a node
 */
export const useDeleteNodeMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, flowId: _flowId }: { id: string; flowId?: string }) => deleteNode(id),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: nodesKeys.detail(variables.id) });
            if (variables.flowId) {
                queryClient.invalidateQueries({ queryKey: nodesKeys.listByFlow(variables.flowId) });
                queryClient.invalidateQueries({ queryKey: flowsKeys.snapshot(variables.flowId) });
            }
        },
    });
};

/**
 * Mutation hook for updating node position
 */
export const useUpdateNodePositionMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, position, flowId: _flowId }: { id: string; position: Position; flowId?: string }) =>
            updateNodePosition(id, position),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: nodesKeys.detail(variables.id) });
            if (variables.flowId) {
                queryClient.invalidateQueries({ queryKey: flowsKeys.snapshot(variables.flowId) });
            }
        },
    });
};

/**
 * Mutation hook for updating node config
 */
export const useUpdateNodeConfigMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            id,
            config,
            flowId: _flowId,
        }: {
            id: string;
            config: Array<{ key: string; val: string }>;
            flowId?: string;
        }) => updateNodeConfig(id, config),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: nodesKeys.detail(variables.id) });
            if (variables.flowId) {
                queryClient.invalidateQueries({ queryKey: flowsKeys.snapshot(variables.flowId) });
            }
        },
    });
};

/**
 * Mutation hook for updating node status
 */
export const useUpdateNodeStatusMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            id,
            status,
            errorMessage,
            flowId: _flowId,
        }: {
            id: string;
            status: string;
            errorMessage?: string;
            flowId?: string;
        }) => updateNodeStatus(id, status, errorMessage),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: nodesKeys.detail(variables.id) });
            if (variables.flowId) {
                queryClient.invalidateQueries({ queryKey: flowsKeys.snapshot(variables.flowId) });
            }
        },
    });
};

/**
 * Mutation hook for updating node label
 */
export const useUpdateNodeLabelMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, label, flowId: _flowId }: { id: string; label: string; flowId?: string }) =>
            updateNodeLabel(id, label),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: nodesKeys.detail(variables.id) });
            if (variables.flowId) {
                queryClient.invalidateQueries({ queryKey: flowsKeys.snapshot(variables.flowId) });
            }
        },
    });
};

// Re-export types for convenience
export type { NodeView, NodeBody, Position };
