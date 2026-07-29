import type { EdgeData, NodeData } from '@lemoncloud/eureka-flows-api';

/** The graph as export/import round-trips it — the raw canvas graph, IDs and all. */
export interface FlowJson {
    nodes: NodeData[];
    edges: EdgeData[];
}

/**
 * Serialize the live canvas graph to a round-trippable JSON string.
 *
 * IDs are kept, unlike the Header export that strips them: the whole point of the dev
 * round-trip is to prove a client-minted id survives export → import unchanged (AC3), and
 * reminting would erase exactly the thing under test.
 */
export const serializeFlowJson = (graph: FlowJson): string =>
    JSON.stringify({ nodes: graph.nodes, edges: graph.edges }, null, 2);

export type ParseFlowJsonResult = { ok: true; graph: FlowJson } | { ok: false; error: string };

/**
 * Parse and validate imported flow JSON, refusing a shape the canvas cannot load rather
 * than handing garbage to `loadWorkflow`. `edges` is optional — a flow may have none.
 */
export const parseFlowJson = (text: string): ParseFlowJsonResult => {
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        return { ok: false, error: 'Not valid JSON.' };
    }
    if (!data || typeof data !== 'object') return { ok: false, error: 'Expected a JSON object with "nodes".' };

    const { nodes, edges } = data as { nodes?: unknown; edges?: unknown };
    if (!Array.isArray(nodes)) return { ok: false, error: 'Missing "nodes" array.' };

    const edgeList = edges ?? [];
    if (!Array.isArray(edgeList)) return { ok: false, error: '"edges" must be an array.' };

    const nodesValid = nodes.every(n => !!n && typeof n === 'object' && typeof (n as NodeData).id === 'string');
    if (!nodesValid) return { ok: false, error: 'Every node needs a string "id".' };

    return { ok: true, graph: { nodes: nodes as NodeData[], edges: edgeList as EdgeData[] } };
};
