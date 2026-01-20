import { api, withRetry } from '@flows/web-core';

import type { ApiListResult, FlowBody, FlowView, InputOverrideItem, SaveSnapshotBody, SnapShotResult } from '../types';
import type { BlockDefinition, DataPacket, LogEntry } from '@lemoncloud/eureka-flows-api';

const _log = console.log.bind(console, '[flows-api]');

// ============================================================================
// Mock Data (fallback when API is unavailable)
// ============================================================================

/**
 * Mock snapshot data for development/testing
 * Uses NodeData format (frontend) with connections instead of edges
 */
const MOCK_SNAPSHOT = {
    id: 'mock-flow-1',
    name: 'Sample Workflow',
    state: 'active' as const,
    nodes: [
        {
            id: 'node-1',
            type: 'input-text',
            position: { x: 100, y: 150 },
            config: { text: 'Hello World' },
            status: 'IDLE' as const,
            inputData: {},
            outputData: {},
            customLabel: 'Text Input',
        },
        {
            id: 'node-2',
            type: 'text-transform',
            position: { x: 400, y: 150 },
            config: { mode: 'uppercase' },
            status: 'IDLE' as const,
            inputData: {},
            outputData: {},
            customLabel: 'Text Transform',
        },
        {
            id: 'node-3',
            type: 'debug-log',
            position: { x: 700, y: 150 },
            config: { prefix: 'Output:' },
            status: 'IDLE' as const,
            inputData: {},
            outputData: {},
            customLabel: 'Console Log',
        },
    ],
    edges: [],
    connections: [
        {
            id: 'conn-1',
            sourceNodeId: 'node-1',
            sourcePortId: 'out',
            targetNodeId: 'node-2',
            targetPortId: 'in',
        },
        {
            id: 'conn-2',
            sourceNodeId: 'node-2',
            sourcePortId: 'out',
            targetNodeId: 'node-3',
            targetPortId: 'in',
        },
    ],
};

// ============================================================================
// Flow CRUD API
// ============================================================================

/**
 * List all flows
 * GET /flows
 */
export const listFlows = async (): Promise<FlowView[]> => {
    _log('> listFlows()');
    try {
        const response = await withRetry(() => api.get<ApiListResult<FlowView>>('/flows'), 3, 'listFlows');
        return response.data.list || [];
    } catch (err) {
        _log('> listFlows error, returning mock:', err);
        return [{ id: MOCK_SNAPSHOT.id, name: MOCK_SNAPSHOT.name, state: MOCK_SNAPSHOT.state }];
    }
};

/**
 * Get flow by ID
 * GET /flows/:id
 */
export const getFlow = async (id: string): Promise<FlowView> => {
    _log(`> getFlow(${id})`);
    try {
        const response = await api.get<FlowView>(`/flows/${id}`);
        return response.data;
    } catch (err) {
        _log('> getFlow error, returning mock:', err);
        return { id: MOCK_SNAPSHOT.id, name: MOCK_SNAPSHOT.name, state: MOCK_SNAPSHOT.state };
    }
};

/**
 * Load flow snapshot (complete state with nodes and edges)
 * GET /flows/:id/load
 *
 * Returns WorkflowState format: { ...flowView, nodes, edges }
 * Falls back to mock data if API is unavailable
 */
export const getFlowSnapshot = async (id: string): Promise<SnapShotResult> => {
    _log(`> getFlowSnapshot(${id})`);
    try {
        const response = await withRetry(() => api.get<SnapShotResult>(`/flows/${id}/load`), 3, 'getFlowSnapshot');
        return response.data;
    } catch (err) {
        _log('> getFlowSnapshot error, returning mock data:', err);
        // Return mock data with proper structure for frontend consumption
        return {
            ...MOCK_SNAPSHOT,
            id,
            nodes: MOCK_SNAPSHOT.nodes,
            edges: MOCK_SNAPSHOT.connections,
        } as SnapShotResult;
    }
};

/**
 * Save flow snapshot (complete state with nodes and connections)
 * POST /flows/:id/save
 *
 * Saves the full workflow state including all nodes and connections.
 * Returns the saved snapshot result.
 */
export const saveFlowSnapshot = async (id: string, body: SaveSnapshotBody): Promise<SnapShotResult> => {
    _log(`> saveFlowSnapshot(${id})`, { nodeCount: body.nodes.length, edgeCount: body.edges.length });
    try {
        const response = await api.post<SnapShotResult>(`/flows/${id}/save`, body);
        return response.data;
    } catch (err) {
        _log('> saveFlowSnapshot error:', err);
        throw err;
    }
};

/**
 * Create new flow
 * POST /flows/0
 */
export const createFlow = async (body: FlowBody): Promise<FlowView> => {
    _log('> createFlow()', body);
    try {
        const response = await api.post<FlowView>('/flows/0', body);
        return response.data;
    } catch (err) {
        _log('> createFlow error, returning mock:', err);
        return { id: `mock-${Date.now()}`, name: body.name || 'New Flow', state: 'draft' };
    }
};

/**
 * Update existing flow
 * PUT /flows/:id
 */
export const updateFlow = async (id: string, body: FlowBody): Promise<FlowView> => {
    _log(`> updateFlow(${id})`, body);
    try {
        const response = await api.put<FlowView>(`/flows/${id}`, body);
        return response.data;
    } catch (err) {
        _log('> updateFlow error, returning mock:', err);
        return { id, ...body };
    }
};

/**
 * Delete flow
 * DELETE /flows/:id
 */
export const deleteFlow = async (id: string): Promise<void> => {
    _log(`> deleteFlow(${id})`);
    try {
        await api.delete(`/flows/${id}`);
    } catch (err) {
        _log('> deleteFlow error (ignored):', err);
    }
};

// ============================================================================
// Flow Execution API
// ============================================================================

/**
 * Run flow execution starting from a specific node
 * POST /flows/:flowId/run?nodeId=xxx&propagate=true
 */
export const runFlow = async (
    flowId: string,
    nodeId: string,
    options?: {
        propagate?: boolean;
        inputOverrides?: InputOverrideItem[];
    }
): Promise<FlowView> => {
    _log(`> runFlow(${flowId}, ${nodeId})`, options);
    try {
        const propagate = options?.propagate ?? true;
        const response = await api.post<FlowView>(`/flows/${flowId}/run?nodeId=${nodeId}&propagate=${propagate}`, {
            inputOverrides: options?.inputOverrides,
        });
        return response.data;
    } catch (err) {
        _log('> runFlow error, returning mock:', err);
        return { id: flowId, executionStatus: 'running', activeRunId: `run-${Date.now()}` };
    }
};

/**
 * Stop flow execution
 * POST /flows/:flowId/stop
 */
export const stopFlow = async (flowId: string, nodeId?: string): Promise<FlowView> => {
    _log(`> stopFlow(${flowId}, ${nodeId ?? 'all'})`);
    try {
        const params = nodeId ? `?nodeId=${nodeId}` : '';
        const response = await api.post<FlowView>(`/flows/${flowId}/stop${params}`);
        return response.data;
    } catch (err) {
        _log('> stopFlow error, returning mock:', err);
        return { id: flowId, executionStatus: 'idle', activeRunId: undefined };
    }
};

// ============================================================================
// Block Logs API
// ============================================================================

/**
 * Fetch execution logs for a node
 * TODO: Implement actual API call when endpoint is available
 */
export const fetchBlockLogs = async (nodeId: string): Promise<LogEntry[]> => {
    _log(`> fetchBlockLogs(${nodeId})`);
    // TODO: Replace with actual API call when endpoint is available
    // const response = await api.get<ApiListResult<LogEntry>>(`/nodes/${nodeId}/logs`);
    // return response.data.list || [];
    return [];
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a DataPacket
 */
export const createPacket = (value: unknown, type: 'text' | 'image' | 'number'): DataPacket => ({
    value,
    type,
    timestamp: Date.now(),
});

// Re-export types for convenience
export type { BlockDefinition, DataPacket, LogEntry };
export type { FlowView, FlowBody, SnapShotResult, InputOverrideItem } from '../types';
