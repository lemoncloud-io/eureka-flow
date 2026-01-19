import { api, withRetry } from '@flows/web-core';

import type { ApiListResult, EdgeBody, EdgeView } from '../types';

const _log = console.log.bind(console, '[edges-api]');

// ============================================================================
// Edge CRUD API
// ============================================================================

/**
 * List edges by flow ID
 * POST /edges/0/list
 */
export const listEdges = async (flowId: string): Promise<EdgeView[]> => {
    _log(`> listEdges(${flowId})`);
    const response = await withRetry(
        () => api.post<ApiListResult<EdgeView>>('/edges/0/list', { flowId }),
        3,
        'listEdges'
    );
    return response.data.list || [];
};

/**
 * Search edges with query parameters
 * GET /edges/0/list
 */
export const searchEdges = async (params: {
    flowId?: string;
    sourceNodeId?: string;
    targetNodeId?: string;
}): Promise<EdgeView[]> => {
    _log('> searchEdges()', params);
    const queryParams = new URLSearchParams();
    if (params.flowId) queryParams.append('flowId', params.flowId);
    if (params.sourceNodeId) queryParams.append('sourceNodeId', params.sourceNodeId);
    if (params.targetNodeId) queryParams.append('targetNodeId', params.targetNodeId);

    const queryString = queryParams.toString();
    const url = queryString ? `/edges/0/list?${queryString}` : '/edges/0/list';

    const response = await api.get<ApiListResult<EdgeView>>(url);
    return response.data.list || [];
};

/**
 * Get edge by ID
 * GET /edges/:id
 */
export const getEdge = async (id: string): Promise<EdgeView> => {
    _log(`> getEdge(${id})`);
    const response = await api.get<EdgeView>(`/edges/${id}`);
    return response.data;
};

/**
 * Create new edge
 * POST /edges/0
 */
export const createEdge = async (body: EdgeBody): Promise<EdgeView> => {
    _log('> createEdge()', body);
    const response = await api.post<EdgeView>('/edges/0', body);
    return response.data;
};

/**
 * Update existing edge
 * POST /edges/:id
 */
export const updateEdge = async (id: string, body: EdgeBody): Promise<EdgeView> => {
    _log(`> updateEdge(${id})`, body);
    const response = await api.post<EdgeView>(`/edges/${id}`, body);
    return response.data;
};

/**
 * Delete edge
 * DELETE /edges/:id
 */
export const deleteEdge = async (id: string): Promise<void> => {
    _log(`> deleteEdge(${id})`);
    await api.delete(`/edges/${id}`);
};

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Create multiple edges at once
 */
export const createEdges = async (edges: EdgeBody[]): Promise<EdgeView[]> => {
    _log(`> createEdges(${edges.length})`);
    const results = await Promise.all(edges.map(edge => createEdge(edge)));
    return results;
};

/**
 * Delete multiple edges at once
 */
export const deleteEdges = async (ids: string[]): Promise<void> => {
    _log(`> deleteEdges(${ids.length})`);
    await Promise.all(ids.map(id => deleteEdge(id)));
};

/**
 * Delete all edges for a node (when node is deleted)
 */
export const deleteEdgesForNode = async (flowId: string, nodeId: string): Promise<void> => {
    _log(`> deleteEdgesForNode(${flowId}, ${nodeId})`);
    const edges = await listEdges(flowId);
    const edgesToDelete = edges.filter(edge => edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId);
    const idsToDelete = edgesToDelete.map(e => e.id).filter((id): id is string => Boolean(id));
    await deleteEdges(idsToDelete);
};

// Re-export types
export type { EdgeView, EdgeBody } from '../types';
