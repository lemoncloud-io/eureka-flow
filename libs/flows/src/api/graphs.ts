import { api, withRetry } from '@flows/web-core';

import type { ReagraphGraph } from '../types';

const _log = console.log.bind(console, '[graphs-api]');

/**
 * Fetch Reagraph-compatible graph data for a flow.
 * GET /flows/:id/graph
 *
 * @param flowId - Flow ID to fetch graph for
 * @returns ReagraphGraph with nodes and edges
 */
export const fetchFlowGraph = async (flowId: string): Promise<ReagraphGraph> => {
    _log(`> fetchFlowGraph(${flowId})`);
    const response = await withRetry(() => api.get<ReagraphGraph>(`/flows/${flowId}/graph`), 3, 'fetchFlowGraph');
    return response.data;
};
