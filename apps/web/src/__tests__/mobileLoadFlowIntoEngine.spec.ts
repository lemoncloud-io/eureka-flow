import { describe, expect, it } from 'vitest';

import { createFlowEngine } from '@flows/engine';

import { loadFlowIntoEngine } from '../app/features/mobile-editor/utils';

import type { DataPacket } from '@lemoncloud/eureka-flows-api';

const packet = (value: string): DataPacket => ({ type: 'text', value }) as DataPacket;

const twoNodes = {
    nodes: [
        { id: 'n1', type: 'input-text', position: { x: 0, y: 0 } },
        { id: 'n2', type: 'preview', position: { x: 200, y: 0 } },
    ],
    edges: [{ id: 'e1', sourceNodeId: 'n1', sourcePortId: 'out', targetNodeId: 'n2', targetPortId: 'in' }],
};

/**
 * The mobile editor used to load through `useCanvasStore.loadWorkflow`, which has no `ports`
 * parameter — so the port rows the server sends alongside the nodes were dropped and a
 * freshly opened flow showed no data from its last run. `libs/engine/src/core/ingress.ts`
 * is where that folding lives; these pin that the mobile path actually reaches it.
 */
describe('loadFlowIntoEngine — the mobile load path', () => {
    it('folds the server port rows into the nodes that own them', () => {
        const engine = createFlowEngine();

        loadFlowIntoEngine(engine, {
            ...twoNodes,
            ports: [{ id: 'n1:out', nodeId: 'n1', portId: 'out', data: packet('hello') }],
        });

        const [n1] = engine.getGraph().nodes;
        expect(n1.outputData?.out).toEqual(packet('hello'));
    });

    it('propagates a folded output along its edge, so the downstream node has an input', () => {
        const engine = createFlowEngine();

        loadFlowIntoEngine(engine, {
            ...twoNodes,
            ports: [{ id: 'n1:out', nodeId: 'n1', portId: 'out', data: packet('hello') }],
        });

        const n2 = engine.getGraph().nodes.find(n => n.id === 'n2');
        expect(n2?.inputData?.in).toEqual(packet('hello'));
    });

    it('drops rows the server did not answer, keeping the ones it did', () => {
        const engine = createFlowEngine();

        loadFlowIntoEngine(engine, {
            ...twoNodes,
            ports: [
                { id: 'n1:out', nodeId: 'n1', portId: 'out', data: packet('answered') },
                // `undefined` is the server declining to say; `null` is it saying "empty".
                { id: 'n2:in', nodeId: 'n2', portId: 'in', data: undefined },
            ],
        });

        const nodes = engine.getGraph().nodes;
        expect(nodes.find(n => n.id === 'n1')?.outputData?.out).toEqual(packet('answered'));
        // n2's input is the propagated upstream value, not the unanswered row.
        expect(nodes.find(n => n.id === 'n2')?.inputData?.in).toEqual(packet('answered'));
    });

    it('takes a graph with no ports at all — the draft-recovery path has none', () => {
        const engine = createFlowEngine();

        loadFlowIntoEngine(engine, twoNodes);

        expect(engine.getGraph().nodes).toHaveLength(2);
        expect(engine.getGraph().nodes[0].outputData ?? {}).toEqual({});
    });

    it('takes the legacy `connections` key, which older saves still use', () => {
        const engine = createFlowEngine();

        loadFlowIntoEngine(engine, {
            nodes: twoNodes.nodes,
            connections: twoNodes.edges,
            ports: [{ id: 'n1:out', nodeId: 'n1', portId: 'out', data: packet('legacy') }],
        });

        expect(engine.getGraph().edges).toHaveLength(1);
        expect(engine.getGraph().nodes.find(n => n.id === 'n2')?.inputData?.in).toEqual(packet('legacy'));
    });
});
