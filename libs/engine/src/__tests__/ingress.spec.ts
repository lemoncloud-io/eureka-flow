import { describe, expect, it } from 'vitest';

import { applyPortRows, propagateAlongEdges } from '../core/ingress';
import { createFlowEngine } from '../engine';

import type { GraphEdge, GraphNode } from '../types';
import type { DataPacket, WorkflowState } from '@lemoncloud/eureka-flows-api';

const packet = (value: unknown): DataPacket => ({ value, type: 'text' }) as DataPacket;

const node = (id: string, extra: Partial<GraphNode> = {}): GraphNode =>
    ({ id, type: 'input-text', position: { x: 0, y: 0 }, config: {}, ...extra }) as GraphNode;

const edge = (id: string, from: string, to: string): GraphEdge =>
    ({ id, sourceNodeId: from, sourcePortId: 'out', targetNodeId: to, targetPortId: 'in' }) as GraphEdge;

describe('applyPortRows', () => {
    it('files a port named out as output and everything else as input', () => {
        const [n] = applyPortRows(
            [node('n1')],
            [
                { nodeId: 'n1', portId: 'out', data: packet('produced') },
                { nodeId: 'n1', portId: 'in', data: packet('received') },
            ]
        );

        expect(n.outputData).toEqual({ out: packet('produced') });
        expect(n.inputData).toEqual({ in: packet('received') });
    });

    it('skips a row the server confirmed empty', () => {
        const [n] = applyPortRows([node('n1')], [{ nodeId: 'n1', portId: 'in', data: null }]);

        expect(n.inputData ?? {}).toEqual({});
    });

    it('returns nodes by identity when there are no rows for them', () => {
        const original = node('n1');

        const [same] = applyPortRows([original], []);
        const [untouched] = applyPortRows([original], [{ nodeId: 'other', portId: 'in', data: packet('x') }]);

        expect(same).toBe(original);
        expect(untouched).toBe(original);
    });
});

describe('propagateAlongEdges', () => {
    it('moves a source output into the input it feeds', () => {
        const nodes = [node('n1', { outputData: { out: packet('hello') } }), node('n2')];

        const [, target] = propagateAlongEdges(nodes, [edge('e1', 'n1', 'n2')]);

        expect(target.inputData).toEqual({ in: packet('hello') });
    });

    it('replaces what an earlier run left on the target port', () => {
        const nodes = [
            node('n1', { outputData: { out: packet('fresh') } }),
            node('n2', { inputData: { in: packet('stale') } }),
        ];

        const [, target] = propagateAlongEdges(nodes, [edge('e1', 'n1', 'n2')]);

        expect(target.inputData).toEqual({ in: packet('fresh') });
    });

    it('ignores a port that has been read but produced nothing', () => {
        const nodes = [node('n1', { outputData: { out: {} as DataPacket } }), node('n2')];

        const [, target] = propagateAlongEdges(nodes, [edge('e1', 'n1', 'n2')]);

        expect(target.inputData ?? {}).toEqual({});
    });

    it('returns a node by identity when nothing reached it, so a caller sees what moved', () => {
        const source = node('n1');
        const target = node('n2');

        const result = propagateAlongEdges([source, target], [edge('e1', 'n1', 'n2')]);

        expect(result[1]).toBe(target);
    });
});

describe('loadGraph is the single ingress', () => {
    const state = {
        nodes: [node('n1'), node('n2')],
        edges: [edge('e1', 'n1', 'n2')],
    } as unknown as WorkflowState;

    it('folds port values in and propagates them in one pass', () => {
        const engine = createFlowEngine();

        engine.loadGraph(state, { ports: [{ nodeId: 'n1', portId: 'out', data: packet('loaded') }] });

        const [source, target] = engine.getGraph().nodes;
        expect(source.outputData).toEqual({ out: packet('loaded') });
        // The point of the slice: a headless load used to stop after normalize, so the
        // downstream node came back with nothing on its input.
        expect(target.inputData).toEqual({ in: packet('loaded') });
    });

    it('needs no ports argument', () => {
        const engine = createFlowEngine();

        engine.loadGraph(state);

        expect(engine.getGraph().nodes).toHaveLength(2);
        expect(engine.getGraph().nodes[1].inputData ?? {}).toEqual({});
    });

    it('reads edges from the legacy connections field', () => {
        const engine = createFlowEngine();

        engine.loadGraph({
            nodes: [node('n1'), node('n2')],
            connections: [edge('e1', 'n1', 'n2')],
        } as unknown as WorkflowState);

        expect(engine.getGraph().edges).toHaveLength(1);
    });
});
