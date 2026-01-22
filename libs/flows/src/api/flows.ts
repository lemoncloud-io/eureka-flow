import { api, withRetry } from '@flows/web-core';

import type { ApiListResult, FlowBody, FlowView, LoadFlowResult, SaveFlowBody, SaveFlowView } from '../types';
import type { BlockDefinition, DataPacket, LogEntry } from '@lemoncloud/eureka-flows-api';

const _log = console.log.bind(console, '[flows-api]');

// ============================================================================
// Mock Data (fallback when API is unavailable)
// ============================================================================

/**
 * Mock snapshot data for development/testing
 * Uses WorkflowState format: { nodes, edges }
 *
 * NodeData format:
 * - config: Record<string, string> (object format)
 * - inputData/outputData: Record<string, DataPacket> (object format)
 * - status: 'IDLE' | 'WAITING' | 'READY' | 'RUNNING' | 'COMPLETED' | 'ERROR'
 */
const MOCK_SNAPSHOT: LoadFlowResult = {
    id: 'mock-flow-1',
    name: 'Sample Workflow',
    state: 'active',
    nodes: [
        {
            id: 'node-1',
            type: 'input-text',
            position: { x: 100, y: 150 },
            config: { text: 'Hello World' },
            status: 'IDLE',
            inputData: {},
            outputData: {},
            customLabel: 'Text Input',
            disabled: false,
        },
        {
            id: 'node-2',
            type: 'text-transform',
            position: { x: 400, y: 150 },
            config: { mode: 'uppercase' },
            status: 'IDLE',
            inputData: {},
            outputData: {},
            customLabel: 'Text Transform',
            disabled: false,
        },
        {
            id: 'node-3',
            type: 'debug-log',
            position: { x: 700, y: 150 },
            config: { prefix: 'Output:' },
            status: 'IDLE',
            inputData: {},
            outputData: {},
            customLabel: 'Console Log',
            disabled: false,
        },
    ],
    edges: [
        {
            id: 'edge-1',
            sourceNodeId: 'node-1',
            sourcePortId: 'out',
            targetNodeId: 'node-2',
            targetPortId: 'in',
        },
        {
            id: 'edge-2',
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
    if (!id) {
        _log('> getFlow() - skipped (no id)');
        return { id: MOCK_SNAPSHOT.id, name: MOCK_SNAPSHOT.name, state: MOCK_SNAPSHOT.state };
    }
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
 * @see eureka-flows-api #0.26.111
 * Returns SaveFlowBody format: { ...flowView, nodes: NodeData[], edges: EdgeData[] }
 * Falls back to mock data if API is unavailable
 */
export const loadFlow = async (id: string): Promise<LoadFlowResult> => {
    if (!id) {
        _log('> loadFlow() - skipped (no id)');
        return {
            ...MOCK_SNAPSHOT,
            id: 'mock-flow-1',
        };
    }
    _log(`> loadFlow(${id})`);
    try {
        const response = await withRetry(() => api.get<LoadFlowResult>(`/flows/${id}/load`), 3, 'loadFlow');
        return response.data;
    } catch (err) {
        _log('> loadFlow error, returning mock data:', err);
        return {
            ...MOCK_SNAPSHOT,
            id,
        };
    }
};

/**
 * Save flow snapshot (complete state with nodes and edges)
 * POST /flows/:id/save
 *
 * @see eureka-flows-api #0.26.111
 * Body: SaveFlowBody { nodes: NodeData[], edges: EdgeData[] }
 * Response: SaveFlowView { nodes$$, edges$$, ports$$ }
 *
 * Saves the full workflow state including all nodes and edges.
 * Returns the saved result with $$ suffix format.
 */
export const saveFlow = async (id: string, body: SaveFlowBody): Promise<SaveFlowView> => {
    _log(`> saveFlow(${id})`, { nodeCount: body.nodes.length, edgeCount: body.edges?.length ?? 0 });
    try {
        const response = await api.post<SaveFlowView>(`/flows/${id}/save`, body);
        return response.data;
    } catch (err) {
        _log('> saveFlow error:', err);
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
 * POST /flows/:id
 *
 * Note: Backend uses POST for both create and update
 */
export const updateFlow = async (id: string, body: FlowBody): Promise<FlowView> => {
    _log(`> updateFlow(${id})`, body);
    try {
        const response = await api.post<FlowView>(`/flows/${id}`, body);
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
export type { FlowView, FlowBody, LoadFlowResult, SaveFlowBody, SaveFlowView } from '../types';
