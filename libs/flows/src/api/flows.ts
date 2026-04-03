import { API_URL, api, withRetry } from '@flows/web-core';

import type { ApiListResult, FlowView, LoadFlowResult, SaveFlowBody, SaveFlowView, UpdateFlowBody } from '../types';
import type { BlockDefinition, DataPacket, LogEntry } from '@lemoncloud/eureka-flows-api';

const _log = console.log.bind(console, '[flows-api]');

/**
 * List all flows
 * GET /flows
 *
 * @returns ApiListResult<FlowView> with list of flows and total count
 */
export const listFlows = async (): Promise<ApiListResult<FlowView>> => {
    _log('> listFlows()');
    const response = await withRetry(() => api.get<ApiListResult<FlowView>>('/flows'), 3, 'listFlows');
    return response.data;
};

/**
 * List public flows (always uses /public endpoint regardless of auth state)
 * GET /public/flows
 */
export const listPublicFlows = async (): Promise<ApiListResult<FlowView>> => {
    _log('> listPublicFlows()');
    const response = await withRetry(
        () => api.get<ApiListResult<FlowView>>(`${API_URL}/public/flows`),
        3,
        'listPublicFlows'
    );
    return response.data;
};

/**
 * Load flow snapshot (complete state with nodes and edges)
 * GET /flows/:id/load
 *
 * @see eureka-flows-api #0.26.111
 * @param id - Flow ID to load
 * @throws Error if id is missing or API call fails
 */
export const loadFlow = async (id: string): Promise<LoadFlowResult> => {
    if (!id) {
        throw new Error('Flow ID is required');
    }
    _log(`> loadFlow(${id})`);
    const response = await withRetry(() => api.get<LoadFlowResult>(`/flows/${id}/load`), 3, 'loadFlow');
    return response.data;
};

/**
 * Save flow snapshot (complete state with nodes and edges)
 * POST /flows/:id/save
 *
 * @see eureka-flows-api #0.26.111
 * @param id - Flow ID ('0' for create new)
 * @param body - SaveFlowBody { nodes: NodeData[], edges: EdgeData[] }
 * @returns SaveFlowView with the flow ID and saved state
 */
export const saveFlow = async (id: string, body: SaveFlowBody): Promise<SaveFlowView> => {
    _log(`> saveFlow(${id})`, { nodeCount: body.nodes.length, edgeCount: body.edges?.length ?? 0 });
    const response = await api.post<SaveFlowView>(`/flows/${id}/save`, body);
    return response.data;
};

/**
 * Create new flow via POST /flows/0/save
 * This is the only way to create a new flow in the backend.
 *
 * @param body - Initial flow state (nodes, edges)
 * @returns SaveFlowView with the new flow ID from server
 */
export const createFlow = async (body?: Partial<SaveFlowBody>): Promise<SaveFlowView> => {
    _log('> createFlow() via POST /flows/0/save');
    const saveBody: SaveFlowBody = {
        nodes: body?.nodes ?? [],
        edges: body?.edges ?? [],
    };
    return saveFlow('0', saveBody);
};

/**
 * Upsert flow (batch update nodes and edges)
 * POST /flows/:id/upsert
 *
 * Use this for batch operations like:
 * - Moving multiple nodes at once
 * - Bulk node/edge updates
 *
 * @see eureka-flows-api v0.26.212
 * @param id - Flow ID to upsert into
 * @param body - SaveFlowBody { nodes: NodeData[], edges: EdgeData[] }
 * @returns SaveFlowView with updated nodes, edges, ports
 */
export const upsertFlow = async (id: string, body: SaveFlowBody): Promise<SaveFlowView> => {
    if (!id) {
        throw new Error('Flow ID is required');
    }
    _log(`> upsertFlow(${id})`, { nodeCount: body.nodes?.length ?? 0, edgeCount: body.edges?.length ?? 0 });
    const response = await api.post<SaveFlowView>(`/flows/${id}/upsert`, body);
    return response.data;
};

/**
 * Update flow metadata (name, description, isPublic, etc.)
 * POST /flows/:id/upsert
 *
 * Uses upsert endpoint instead of POST /flows/:id because
 * the latter is restricted to localhost on the server.
 *
 * @see eureka-flows-api v0.26.126
 * @param id - Flow ID to update
 * @param body - UpdateFlowBody { name?, description?, isPublic? }
 * @returns FlowView with updated metadata
 */
export const updateFlowMetadata = async (id: string, body: UpdateFlowBody): Promise<FlowView> => {
    if (!id) {
        throw new Error('Flow ID is required');
    }
    _log(`> updateFlowMetadata(${id})`, body);
    const response = await api.post<FlowView>(`/flows/${id}/upsert`, body);
    return response.data;
};

/**
 * Delete flow
 * DELETE /flows/:id
 *
 * @param id - Flow ID to delete
 * @returns FlowView with deletedAt set
 */
export const deleteFlow = async (id: string): Promise<FlowView> => {
    if (!id) {
        throw new Error('Flow ID is required');
    }
    _log(`> deleteFlow(${id})`);
    const response = await api.delete<FlowView>(`/flows/${id}`);
    return response.data;
};

/**
 * Fetch execution logs for a node
 * TODO: Implement when server API is available
 * @param nodeId - Node ID to fetch logs for
 * @returns Empty array (placeholder)
 */
export const fetchBlockLogs = async (nodeId: string): Promise<LogEntry[]> => {
    _log(`> fetchBlockLogs(${nodeId})`);
    // TODO: Implement when GET /nodes/:id/logs API is available
    return [];
};

export const createPacket = (value: unknown, type: 'text' | 'image' | 'number'): DataPacket => ({
    value,
    type,
    timestamp: Date.now(),
});

// Re-export types for convenience
export type { BlockDefinition, DataPacket, LogEntry };
export type {
    FlowBody,
    FlowView,
    LoadFlowPortData,
    LoadFlowResult,
    SaveFlowBody,
    SaveFlowView,
    UpdateFlowBody,
} from '../types';
