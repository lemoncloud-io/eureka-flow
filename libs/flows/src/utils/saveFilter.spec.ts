import { beforeEach, describe, expect, it } from 'vitest';

import { excludeUnresolvedFromSave } from './saveFilter';
import { __resetTempIdRegistry, generateTempId, markTempIdResolved } from './tempId';

const node = (id: string) => ({ id });
const edge = (id: string, sourceNodeId: string, targetNodeId: string) => ({ id, sourceNodeId, targetNodeId });

describe('excludeUnresolvedFromSave', () => {
    beforeEach(() => {
        __resetTempIdRegistry();
    });

    it('passes server-ID nodes and edges through unchanged', () => {
        const nodes = [node('1001'), node('1002')];
        const edges = [edge('2001', '1001', '1002')];

        expect(excludeUnresolvedFromSave(nodes, edges)).toEqual({ nodes, edges });
    });

    // Regression: POST /flows/:id/save persisted session temp IDs as canonical server IDs
    // (flow 1008748) because the autosave fired before createNodeAsync resolved.
    it('drops unresolved temp nodes and every edge touching them', () => {
        const tempId = generateTempId('node');
        const tempEdgeId = generateTempId('edge');
        const nodes = [node('1001'), node(tempId)];
        const edges = [edge(tempEdgeId, '1001', tempId)];

        expect(excludeUnresolvedFromSave(nodes, edges)).toEqual({
            nodes: [node('1001')],
            edges: [],
        });
    });

    it('maps resolved temp IDs to server IDs when UI state has not been replaced yet', () => {
        const tempNodeId = generateTempId('node');
        const tempEdgeId = generateTempId('edge');
        markTempIdResolved(tempNodeId, '1002');
        markTempIdResolved(tempEdgeId, '2001');

        const result = excludeUnresolvedFromSave(
            [node('1001'), node(tempNodeId)],
            [edge(tempEdgeId, '1001', tempNodeId)]
        );

        expect(result).toEqual({
            nodes: [node('1001'), node('1002')],
            edges: [edge('2001', '1001', '1002')],
        });
    });

    it('keeps temp-format IDs that were loaded from the server (historical leak)', () => {
        // Not generated this session — canonical server IDs despite the prefix
        const nodes = [node('node_1782955209543_c7usd')];
        const edges = [edge('edge_1782955209543_rbzse', 'node_1782955209543_c7usd', 'node_1782955209543_gmq79')];

        expect(excludeUnresolvedFromSave(nodes, edges)).toEqual({ nodes, edges });
    });
});
