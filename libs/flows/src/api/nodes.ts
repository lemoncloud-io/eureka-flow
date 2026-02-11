import { api, withRetry } from '@flows/web-core';

import type { ApiListResult, DataPacket, NodeBody, NodeView, S3ImageInfo, UpsertNodeResult } from '../types';
import type { EdgeData } from '@lemoncloud/eureka-flows-api';

const _log = console.log.bind(console, '[nodes-api]');

/**
 * Body for POST /nodes/:id/run
 * @see eureka-flows-api #0.26.129
 */
export interface RunNodeBody {
    /** Config to override (not saved) */
    config$?: Record<string, string>;
    /** Output data from frontend execution */
    output?: Record<string, DataPacket>;
}

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
 * Upsert node (create or update)
 * POST /nodes/:id/upsert?flowId=<flowId>
 *
 * Request body format: { nodes: [nodeData] }
 * Response format: { nodes$$: [...], ports$$: [...] }
 *
 * - id="0" with no body.id → create new node
 * - id="0" with body.id → upsert by body.id
 * - id=<nodeId> → upsert existing node
 *
 * @param id - Node ID or "0" for auto-assign
 * @param flowId - Flow ID (required)
 * @param body - Node data to upsert
 * @returns UpsertNodeResult with upserted nodes and ports
 */
export const upsertNode = async (id: string, flowId: string, body: Partial<NodeView>): Promise<UpsertNodeResult> => {
    _log(`> upsertNode(${id}, flowId=${flowId})`, body);
    // Wrap node data in nodes array (SaveFlowBody format)
    const requestBody = { nodes: [{ ...body, id: id === '0' ? undefined : id }] };
    const response = await api.post<UpsertNodeResult>(`/nodes/${id}/upsert`, requestBody, { params: { flowId } });
    return response.data;
};

/**
 * Create edge with server-assigned ID
 * POST /nodes/0/upsert?flowId=<flowId> with { edges: [edge] }
 *
 * Server assigns the edge ID and returns it in edges$$ array.
 *
 * @param flowId - Flow ID (required)
 * @param edge - Edge data to create (without id)
 * @returns UpsertNodeResult with edges$$[0].id containing server-assigned ID
 */
export const upsertEdge = async (flowId: string, edge: EdgeData): Promise<UpsertNodeResult> => {
    _log(`> upsertEdge(flowId=${flowId})`, edge);
    const body = { edges: [edge] };
    const response = await api.post<UpsertNodeResult>('/nodes/0/upsert', body, { params: { flowId } });
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

/**
 * Run node execution options
 */
export interface RunNodeOptions {
    /** If true, queues execution via SQS and returns immediately */
    async?: boolean;
    /** If true, forces execution even if node is busy or isFrontend */
    force?: boolean;
    /** If true, propagates to downstream nodes after execution (default: true) */
    propagate?: boolean;
}

/**
 * Run node execution
 * POST /nodes/:nodeId/run
 *
 * Executes the node's processor with current inputs and config.
 * Supports async execution via SQS queue.
 *
 * @see eureka-flows-api #0.26.129
 * @param nodeId - Node ID to execute
 * @param body - Request body
 * @param body.config$ - Config to override (not saved)
 * @param body.output - Output data from frontend execution (for isFrontend nodes)
 * @param options - Execution options
 * @param options.async - If true, queues execution and returns immediately
 * @param options.force - If true, forces execution even for isFrontend nodes
 * @param options.propagate - If true, propagates to downstream nodes (default: true)
 */
export const runNode = async (nodeId: string, body?: RunNodeBody, options?: RunNodeOptions): Promise<NodeView> => {
    _log(`> runNode(${nodeId})`, { body, options });
    try {
        // Build query params
        const queryParams: string[] = [];
        if (options?.async) queryParams.push('async');
        if (options?.force) queryParams.push('force');
        if (options?.propagate === false) queryParams.push('propagate=0');

        const params = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
        const response = await api.post<NodeView>(`/nodes/${nodeId}/run${params}`, body || {});
        return response.data;
    } catch (err) {
        _log('> runNode error:', err);
        throw err;
    }
};

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
