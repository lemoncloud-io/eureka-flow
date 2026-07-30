import { describe, expect, it } from 'vitest';

import { EngineError } from '../core/ops';
import { createFlowEngine } from '../engine';

import type { GraphOps } from '../core/ops';
import type { BlockDefinitionWithFrontend } from '../types';
import type { Position } from '@lemoncloud/eureka-flows-api';

const at = (x: number, y: number): Position => ({ x, y });

const registry = {
    'input-text': { type: 'input-text', inputs: [], outputs: [{ id: 'out', type: 'text' }] },
    'process-image': {
        type: 'process-image',
        inputs: [{ id: 'in', type: 'image' }],
        outputs: [{ id: 'out', type: 'image' }],
    },
    'process-any': {
        type: 'process-any',
        inputs: [
            { id: 'in', type: 'any' },
            { id: 'alt', type: 'any' },
        ],
        outputs: [{ id: 'out', type: 'any' }],
    },
} as unknown as Record<string, BlockDefinitionWithFrontend>;

const withRegistry = () => createFlowEngine({ getBlockRegistry: () => registry });

/** Add two nodes and wire them, returning the ids in play. */
const chain = (engine: ReturnType<typeof createFlowEngine>) => {
    let a = '';
    let b = '';
    engine.transact('setup', ops => {
        a = ops.addNode({ type: 'input-text', position: at(0, 0) });
        b = ops.addNode({ type: 'process-any', position: at(300, 0) });
    });
    let edge = '';
    engine.transact('edge:connect', ops => {
        edge = ops.connect({ sourceNodeId: a, sourcePortId: 'out', targetNodeId: b, targetPortId: 'in' });
    });
    return { a, b, edge };
};

describe('ops.addNode', () => {
    it('mints an idle node with the config it was handed', () => {
        const engine = createFlowEngine();
        let id = '';
        engine.transact('node:add', ops => {
            id = ops.addNode({ type: 'input-text', position: at(20, 40), config: { value: 'hi' } });
        });

        const [node] = engine.getGraph().nodes;
        expect(node.id).toBe(id);
        expect(node.position).toEqual(at(20, 40));
        expect(node.config).toEqual({ value: 'hi' });
        expect(node.state).toBe('IDLE');
        expect(node.inputData).toEqual({});
        expect(node.autoExecutionEnabled).toBe(true);
    });

    it('copies the config it was handed rather than holding the caller object', () => {
        const engine = createFlowEngine();
        const config: Record<string, unknown> = { value: 'first' };
        engine.transact('node:add', ops => ops.addNode({ type: 'input-text', position: at(0, 0), config }));

        config.value = 'second';

        expect(engine.getGraph().nodes[0].config).toEqual({ value: 'first' });
    });
});

describe('ops.updateNode', () => {
    it('merges the patch over the node', () => {
        const engine = createFlowEngine();
        const { a } = chain(engine);
        engine.transact('node:label', ops => ops.updateNode(a, { customLabel: 'Source' }));

        const node = engine.getGraph().nodes.find(n => n.id === a);
        expect(node?.customLabel).toBe('Source');
        expect(node?.type).toBe('input-text');
    });

    it('refuses a node that is not there', () => {
        const engine = createFlowEngine();
        expect(() => engine.transact('node:label', ops => ops.updateNode('nope', {}))).toThrow(EngineError);
    });
});

describe('ops.removeNodes', () => {
    it('takes the incident edges with the node', () => {
        const engine = createFlowEngine();
        const { a, b } = chain(engine);
        expect(engine.getGraph().edges).toHaveLength(1);

        engine.transact('selection:delete', ops => ops.removeNodes([a]));

        const graph = engine.getGraph();
        expect(graph.nodes.map(n => n.id)).toEqual([b]);
        expect(graph.edges).toHaveLength(0);
    });

    it('removes several nodes in one go', () => {
        const engine = createFlowEngine();
        const { a, b } = chain(engine);

        engine.transact('selection:delete', ops => ops.removeNodes([a, b]));

        expect(engine.getGraph().nodes).toHaveLength(0);
    });
});

describe('ops.connect', () => {
    it('refuses a second copy of a connection that already exists', () => {
        const engine = withRegistry();
        const { a, b } = chain(engine);

        expect(() =>
            engine.transact('edge:connect', ops =>
                ops.connect({ sourceNodeId: a, sourcePortId: 'out', targetNodeId: b, targetPortId: 'in' })
            )
        ).toThrow(expect.objectContaining({ code: 'DUPLICATE_EDGE' }));
    });

    it('refuses an edge that would close a loop', () => {
        const engine = withRegistry();
        const { a, b } = chain(engine);

        expect(() =>
            engine.transact('edge:connect', ops =>
                ops.connect({ sourceNodeId: b, sourcePortId: 'out', targetNodeId: a, targetPortId: 'in' })
            )
        ).toThrow(expect.objectContaining({ code: 'CYCLE' }));
    });

    it('refuses ports that carry different types', () => {
        const engine = withRegistry();
        let text = '';
        let image = '';
        engine.transact('setup', ops => {
            text = ops.addNode({ type: 'input-text', position: at(0, 0) });
            image = ops.addNode({ type: 'process-image', position: at(300, 0) });
        });

        expect(() =>
            engine.transact('edge:connect', ops =>
                ops.connect({ sourceNodeId: text, sourcePortId: 'out', targetNodeId: image, targetPortId: 'in' })
            )
        ).toThrow(expect.objectContaining({ code: 'INCOMPATIBLE_PORTS' }));
    });

    it('skips the type check when no registry was supplied', () => {
        const engine = createFlowEngine();
        let text = '';
        let image = '';
        engine.transact('setup', ops => {
            text = ops.addNode({ type: 'input-text', position: at(0, 0) });
            image = ops.addNode({ type: 'process-image', position: at(300, 0) });
        });

        expect(() =>
            engine.transact('edge:connect', ops =>
                ops.connect({ sourceNodeId: text, sourcePortId: 'out', targetNodeId: image, targetPortId: 'in' })
            )
        ).not.toThrow();
    });

    it('refuses an endpoint that is not on the canvas', () => {
        const engine = withRegistry();
        const { a } = chain(engine);

        expect(() =>
            engine.transact('edge:connect', ops =>
                ops.connect({ sourceNodeId: a, sourcePortId: 'out', targetNodeId: 'ghost', targetPortId: 'in' })
            )
        ).toThrow(expect.objectContaining({ code: 'NODE_NOT_FOUND' }));
    });

    it('replaces the edge already sitting on the target port', () => {
        const engine = withRegistry();
        const { a, b } = chain(engine);
        let other = '';
        engine.transact('setup', ops => {
            other = ops.addNode({ type: 'input-text', position: at(0, 200) });
        });

        engine.transact('edge:connect', ops =>
            ops.connect({ sourceNodeId: other, sourcePortId: 'out', targetNodeId: b, targetPortId: 'in' })
        );

        const edges = engine.getGraph().edges;
        expect(edges).toHaveLength(1);
        expect(edges[0].sourceNodeId).toBe(other);
        expect(a).toBeTruthy();
    });

    it('leaves an edge on a different port of the same node alone', () => {
        const engine = withRegistry();
        const { b } = chain(engine);
        let other = '';
        engine.transact('setup', ops => {
            other = ops.addNode({ type: 'input-text', position: at(0, 200) });
        });

        engine.transact('edge:connect', ops =>
            ops.connect({ sourceNodeId: other, sourcePortId: 'out', targetNodeId: b, targetPortId: 'alt' })
        );

        expect(engine.getGraph().edges).toHaveLength(2);
    });
});

describe('ops.disconnect', () => {
    it('removes the named edges and nothing else', () => {
        const engine = withRegistry();
        const { edge } = chain(engine);

        engine.transact('selection:delete', ops => ops.disconnect([edge]));

        const graph = engine.getGraph();
        expect(graph.edges).toHaveLength(0);
        expect(graph.nodes).toHaveLength(2);
    });
});

describe('transaction boundary', () => {
    it('refuses ops held past the end of their transaction', () => {
        const engine = createFlowEngine();
        let escaped: GraphOps | null = null;
        engine.transact('setup', ops => {
            escaped = ops;
        });

        expect(() => escaped?.addNode({ type: 'input-text', position: at(0, 0) })).toThrow(/outside the transact/);
        expect(engine.getGraph().nodes).toHaveLength(0);
    });
});
