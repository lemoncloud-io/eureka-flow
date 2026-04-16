import { api, withRetry } from '@flows/web-core';

import { encodePathSegment } from '../utils';

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
 * Get edge by ID
 * GET /edges/:id
 */
export const getEdge = async (id: string): Promise<EdgeView> => {
    _log(`> getEdge(${id})`);
    const response = await api.get<EdgeView>(`/edges/${encodePathSegment(id)}`);
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
    const response = await api.post<EdgeView>(`/edges/${encodePathSegment(id)}`, body);
    return response.data;
};

/**
 * Delete edge
 * DELETE /edges/:id
 */
export const deleteEdge = async (id: string): Promise<void> => {
    _log(`> deleteEdge(${id})`);
    await api.delete(`/edges/${encodePathSegment(id)}`);
};

// Re-export types
export type { EdgeView, EdgeBody } from '../types';
