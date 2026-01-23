import { api, withRetry } from '@flows/web-core';

import type { LoadFlowResult, SaveFlowBody, SaveFlowView } from '../types';
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

// NOTE: The backend only supports these APIs:
// - POST /flows/:id/save (create with id='0', or update with existing id)
// - GET /flows/:id/load (load flow snapshot)
// - POST /nodes/:id/run (execute node)
//
// listFlows and getFlow are NOT supported by the backend.

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
