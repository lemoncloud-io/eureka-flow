import { api, withRetry } from '@flows/web-core';

import type { ApiListResult, NodeBody, NodeView, Position, S3ImageInfo, doPostRunBody } from '../types';

const _log = console.log.bind(console, '[nodes-api]');

// ============================================================================
// Node CRUD API
// ============================================================================

/**
 * List nodes by flow ID
 * POST /nodes/0/list
 */
export const listNodes = async (flowId: string): Promise<NodeView[]> => {
    _log(`> listNodes(${flowId})`);
    const response = await withRetry(
        () => api.post<ApiListResult<NodeView>>('/nodes/0/list', { flowId }),
        3,
        'listNodes'
    );
    return response.data.list || [];
};

/**
 * Get node by ID
 * GET /nodes/:id
 */
export const getNode = async (id: string): Promise<NodeView> => {
    _log(`> getNode(${id})`);
    const response = await api.get<NodeView>(`/nodes/${id}`);
    return response.data;
};

/**
 * Create new node
 * POST /nodes/0
 *
 * Required fields: name, flowId, blockId
 */
export const createNode = async (body: NodeBody): Promise<NodeView> => {
    _log('> createNode()', body);

    if (!body.name) throw new Error('Node name is required');
    if (!body.flowId) throw new Error('Node flowId is required');
    if (!body.blockId) throw new Error('Node blockId is required');

    const response = await api.post<NodeView>('/nodes/0', body);
    return response.data;
};

/**
 * Update existing node
 * POST /nodes/:id
 */
export const updateNode = async (id: string, body: Partial<NodeView>): Promise<NodeView> => {
    _log(`> updateNode(${id})`, body);
    const response = await api.post<NodeView>(`/nodes/${id}`, body);
    return response.data;
};

/**
 * Delete node
 * DELETE /nodes/:id
 */
export const deleteNode = async (id: string): Promise<void> => {
    _log(`> deleteNode(${id})`);
    await api.delete(`/nodes/${id}`);
};

// ============================================================================
// Node Position & Config Updates
// ============================================================================

/**
 * Update node position
 */
export const updateNodePosition = async (id: string, position: Position): Promise<NodeView> => {
    _log(`> updateNodePosition(${id})`, position);
    return updateNode(id, { position });
};

/**
 * Update node config
 */
export const updateNodeConfig = async (id: string, config: Array<{ key: string; val: string }>): Promise<NodeView> => {
    _log(`> updateNodeConfig(${id})`, config);
    return updateNode(id, { config$$: config });
};

/**
 * Update node status
 */
export const updateNodeStatus = async (id: string, status: string, errorMessage?: string): Promise<NodeView> => {
    _log(`> updateNodeStatus(${id}, ${status})`);
    return updateNode(id, { status, errorMessage });
};

/**
 * Update node custom label
 */
export const updateNodeLabel = async (id: string, customLabel: string): Promise<NodeView> => {
    _log(`> updateNodeLabel(${id}, ${customLabel})`);
    return updateNode(id, { customLabel });
};

/**
 * Toggle node disabled state
 */
export const toggleNodeDisabled = async (id: string, disabled: boolean): Promise<NodeView> => {
    _log(`> toggleNodeDisabled(${id}, ${disabled})`);
    return updateNode(id, { disabled });
};

// ============================================================================
// Node Execution API
// ============================================================================

/**
 * Run node execution
 * POST /nodes/:nodeId/run
 *
 * Executes the node's processor with current inputs and config.
 * Supports async execution via SQS queue.
 *
 * @see eureka-flows-api #0.26.114
 * @param nodeId - Node ID to execute
 * @param body - Request body containing config
 * @param body.config$ - Node config as Record<string, string>
 * @param options - Execution options
 * @param options.async - If true, queues execution and returns immediately
 */
export const runNode = async (
    nodeId: string,
    body?: doPostRunBody,
    options?: { async?: boolean }
): Promise<NodeView> => {
    _log(`> runNode(${nodeId})`, { body, options });
    try {
        const params = options?.async ? '?async' : '';
        const response = await api.post<NodeView>(`/nodes/${nodeId}/run${params}`, body || {});
        return response.data;
    } catch (err) {
        _log('> runNode error:', err);
        throw err;
    }
};

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Create multiple nodes at once
 */
export const createNodes = async (nodes: NodeBody[]): Promise<NodeView[]> => {
    _log(`> createNodes(${nodes.length})`);
    const results = await Promise.all(nodes.map(node => createNode(node)));
    return results;
};

/**
 * Delete multiple nodes at once
 */
export const deleteNodes = async (ids: string[]): Promise<void> => {
    _log(`> deleteNodes(${ids.length})`);
    await Promise.all(ids.map(id => deleteNode(id)));
};

/**
 * Update multiple node positions at once (for drag operations)
 */
export const updateNodePositions = async (updates: Array<{ id: string; position: Position }>): Promise<NodeView[]> => {
    _log(`> updateNodePositions(${updates.length})`);
    const results = await Promise.all(updates.map(({ id, position }) => updateNodePosition(id, position)));
    return results;
};

// ============================================================================
// Image API (S3 Storage)
// ============================================================================

/**
 * Get image from S3 URL
 * GET /nodes/0/image?s3Url=...
 *
 * Fetches image binary from S3 via proxy endpoint.
 * Returns base64 data URL for direct use in <img> src.
 *
 * @see eureka-flows-api v0.26.126
 * @param s3Url - S3 reference (s3://bucket/key)
 * @returns Data URL (data:image/...;base64,...)
 */
export const getImageFromS3 = async (s3Url: string): Promise<string> => {
    if (!s3Url || !s3Url.startsWith('s3://')) {
        throw new Error('Invalid S3 URL');
    }
    _log(`> getImageFromS3(${s3Url})`);

    const response = await api.get<{ body: string; headers: { 'Content-Type': string } }>('/nodes/0/image', {
        params: { s3Url },
    });

    const contentType = response.data.headers?.['Content-Type'] || 'image/png';
    const base64Body = response.data.body;

    return `data:${contentType};base64,${base64Body}`;
};

/**
 * Get S3 image info (metadata only)
 * GET /nodes/0/image-info?s3Url=...
 *
 * Returns parsed S3 URL information without fetching the image.
 *
 * @see eureka-flows-api v0.26.126
 * @param s3Url - S3 reference (s3://bucket/key)
 * @returns S3ImageInfo with parsed URL data
 */
export const getImageInfo = async (s3Url: string): Promise<S3ImageInfo> => {
    if (!s3Url || !s3Url.startsWith('s3://')) {
        throw new Error('Invalid S3 URL');
    }
    _log(`> getImageInfo(${s3Url})`);

    const response = await api.get<S3ImageInfo>('/nodes/0/image-info', {
        params: { s3Url },
    });

    return response.data;
};

// Re-export types
export type { NodeView, NodeBody, Position, S3ImageInfo } from '../types';
