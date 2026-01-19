import { api, withRetry } from '@flows/web-core';

import type { ApiListResult, FlowBody, FlowView, InputOverrideItem, SnapShotResult } from '../types';
import type { BlockDefinition, DataPacket, LogEntry } from '@lemoncloud/eureka-flows-api';

const _log = console.log.bind(console, '[flows-api]');

// ============================================================================
// Flow CRUD API
// ============================================================================

/**
 * List all flows
 * GET /flows
 */
export const listFlows = async (): Promise<FlowView[]> => {
    _log('> listFlows()');
    const response = await withRetry(() => api.get<ApiListResult<FlowView>>('/flows'), 3, 'listFlows');
    return response.data.list || [];
};

/**
 * Get flow by ID
 * GET /flows/:id
 */
export const getFlow = async (id: string): Promise<FlowView> => {
    _log(`> getFlow(${id})`);
    const response = await api.get<FlowView>(`/flows/${id}`);
    return response.data;
};

/**
 * Get flow snapshot (complete state with nodes and edges)
 * GET /flows/:id/snapshot
 */
export const getFlowSnapshot = async (id: string): Promise<SnapShotResult> => {
    _log(`> getFlowSnapshot(${id})`);
    const response = await withRetry(() => api.get<SnapShotResult>(`/flows/${id}/snapshot`), 3, 'getFlowSnapshot');
    return response.data;
};

/**
 * Create new flow
 * POST /flows/0
 */
export const createFlow = async (body: FlowBody): Promise<FlowView> => {
    _log('> createFlow()', body);
    const response = await api.post<FlowView>('/flows/0', body);
    return response.data;
};

/**
 * Update existing flow
 * POST /flows/:id
 */
export const updateFlow = async (id: string, body: FlowBody): Promise<FlowView> => {
    _log(`> updateFlow(${id})`, body);
    const response = await api.post<FlowView>(`/flows/${id}`, body);
    return response.data;
};

/**
 * Delete flow
 * DELETE /flows/:id
 */
export const deleteFlow = async (id: string): Promise<void> => {
    _log(`> deleteFlow(${id})`);
    await api.delete(`/flows/${id}`);
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
    const propagate = options?.propagate ?? true;
    const response = await api.post<FlowView>(`/flows/${flowId}/run?nodeId=${nodeId}&propagate=${propagate}`, {
        inputOverrides: options?.inputOverrides,
    });
    return response.data;
};

/**
 * Stop flow execution
 * POST /flows/:flowId/stop
 */
export const stopFlow = async (flowId: string, nodeId?: string): Promise<FlowView> => {
    _log(`> stopFlow(${flowId}, ${nodeId ?? 'all'})`);
    const params = nodeId ? `?nodeId=${nodeId}` : '';
    const response = await api.post<FlowView>(`/flows/${flowId}/stop${params}`);
    return response.data;
};

// ============================================================================
// Legacy API (for backward compatibility during migration)
// ============================================================================

/**
 * @deprecated Use getFlowSnapshot instead
 * Load flow by ID - legacy function that returns WorkflowState format
 */
export const loadFlow = async (id?: string): Promise<SnapShotResult | null> => {
    _log(`> loadFlow(${id ?? 'default'})`);
    if (!id) {
        const flows = await listFlows();
        if (flows.length > 0 && flows[0].id) {
            return getFlowSnapshot(flows[0].id);
        }
        return null;
    }
    return getFlowSnapshot(id);
};

/**
 * @deprecated Use getFlowSnapshot instead
 * Load flow design (alias for loadFlow)
 */
export const loadDesign = async (id?: string): Promise<SnapShotResult | null> => {
    return loadFlow(id);
};

/**
 * @deprecated Use createFlow or updateFlow instead
 * Save flow with a name
 */
export const saveFlow = async (_state: unknown, name: string): Promise<{ success: boolean; id: string }> => {
    _log(`> saveFlow(${name}) - deprecated, use createFlow/updateFlow`);
    try {
        const flows = await listFlows();
        const existing = flows.find(f => f.name === name);

        if (existing?.id) {
            await updateFlow(existing.id, { name });
            return { success: true, id: existing.id };
        } else {
            const created = await createFlow({ name });
            return { success: true, id: created.id || '' };
        }
    } catch (e) {
        console.error('Failed to save flow:', e);
        return { success: false, id: '' };
    }
};

/**
 * @deprecated No longer needed with remote API
 * Reset flow to default
 */
export const resetFlow = async (): Promise<boolean> => {
    return true;
};

/**
 * Fetch execution logs for a node
 * TODO: Implement actual API call when endpoint is available
 */
export const fetchBlockLogs = async (nodeId: string): Promise<LogEntry[]> => {
    _log(`> fetchBlockLogs(${nodeId})`);
    // TODO: Replace with actual API call
    // const response = await api.get<ApiListResult<LogEntry>>(`/nodes/${nodeId}/logs`);
    // return response.data.list || [];

    // Temporary mock data
    const now = Date.now();
    const randomLogs: LogEntry[] = [];
    const count = Math.floor(Math.random() * 10) + 5;

    for (let i = 0; i < count; i++) {
        const timeOffset = (count - i) * 1000 * 60;
        const isError = Math.random() > 0.8;
        const isWarn = Math.random() > 0.7;

        randomLogs.push({
            id: Math.random().toString(36).slice(2, 11),
            timestamp: new Date(now - timeOffset).toISOString(),
            type: i === 0 ? 'INIT' : 'EXECUTION',
            level: isError ? 'ERROR' : isWarn ? 'WARN' : 'INFO',
            message: isError
                ? `Failed to process input data at index ${i}`
                : isWarn
                  ? `High latency detected during step ${i}`
                  : `Successfully processed chunk ${i}`,
        });
    }

    return randomLogs.reverse();
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
