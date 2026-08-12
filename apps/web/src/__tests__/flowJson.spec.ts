import { describe, expect, it } from 'vitest';

import { parseFlowJson, serializeFlowJson } from '@flows/flows';

import type { FlowJson, GraphEdge, GraphNode } from '@flows/flows';

const node = (id: string, config: Record<string, unknown> = {}) =>
    ({ id, type: 'text-input', position: { x: 10, y: 20 }, config }) as unknown as GraphNode;

const edge = (id: string, source: string, target: string) =>
    ({
        id,
        sourceNodeId: source,
        targetNodeId: target,
        sourcePortId: 'out',
        targetPortId: 'in',
    }) as unknown as GraphEdge;

const graph: FlowJson = {
    nodes: [node('n' + 'a'.repeat(32), { text: 'hello' }), node('n' + 'b'.repeat(32))],
    edges: [edge('e' + 'c'.repeat(32), 'n' + 'a'.repeat(32), 'n' + 'b'.repeat(32))],
};

describe('serializeFlowJson / parseFlowJson round-trip', () => {
    it('preserves client-minted ids and config verbatim (AC3)', () => {
        const result = parseFlowJson(serializeFlowJson(graph));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.graph).toEqual(graph);
        // Ids specifically — reminting on import would silently pass a shape check but fail this.
        expect(result.graph.nodes.map(n => n.id)).toEqual(graph.nodes.map(n => n.id));
        expect(result.graph.edges[0].id).toBe(graph.edges[0].id);
    });

    it('keeps the node id in the serialized text — the edges reference it', () => {
        expect(serializeFlowJson(graph)).toContain('n' + 'a'.repeat(32));
    });

    it('accepts what the File menu export writes, so the round-trip closes', () => {
        // The Header export is this same serializer now. It used to strip ids, which left
        // edges pointing at nodes that no longer had one — unimportable by construction.
        const exported = serializeFlowJson(graph);
        const result = parseFlowJson(exported);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.graph.edges[0].sourceNodeId).toBe(result.graph.nodes[0].id);
    });
});

describe('parseFlowJson validation', () => {
    it('rejects text that is not JSON', () => {
        expect(parseFlowJson('{ not json')).toEqual({ ok: false, error: 'Not valid JSON.' });
    });

    it('rejects a JSON value that is not an object', () => {
        const result = parseFlowJson('42');
        expect(result.ok).toBe(false);
    });

    it('rejects a payload with no nodes array', () => {
        const result = parseFlowJson(JSON.stringify({ edges: [] }));
        expect(result).toEqual({ ok: false, error: 'Missing "nodes" array.' });
    });

    it('rejects a node without a string id', () => {
        const result = parseFlowJson(JSON.stringify({ nodes: [{ type: 'text-input' }] }));
        expect(result).toEqual({ ok: false, error: 'Every node needs a string "id".' });
    });

    it('accepts a graph with nodes but no edges key, defaulting edges to []', () => {
        const result = parseFlowJson(JSON.stringify({ nodes: [node('n' + 'd'.repeat(32))] }));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.graph.edges).toEqual([]);
    });
});
