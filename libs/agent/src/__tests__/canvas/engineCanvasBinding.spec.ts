import { beforeEach, describe, expect, it } from 'vitest';

import { createFlowEngine } from '@flows/engine';

import { createEngineCanvasBinding } from '../../canvas/engineCanvasBinding';

import type { CanvasBinding, Graph } from '../../canvas/canvasBinding';
import type { EngineEvent, FlowEngine } from '@flows/engine';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

/** The binding against the real engine. The seam is what is under test: edits reach the graph through `transact`, config merges, a bad id fails loudly. */

const GEN = 'n-gen';
const FETCH = 'n-fetch';

const seed = (): Graph => ({
    nodes: [
        {
            id: GEN,
            type: 'generate-text',
            position: { x: 200, y: 80 },
            config: { model: 'gemini-2.5-flash', temperature: '0.7' },
            customLabel: 'Draft',
        },
        { id: FETCH, type: 'fetch-url', position: { x: 0, y: 0 }, config: {} },
    ],
    edges: [],
});

const nodeOf = (binding: CanvasBinding, id: string): NodeData => {
    const node = binding.readGraph().nodes.find(n => n.id === id);
    if (!node) throw new Error(`test setup: no node ${id}`);
    return node;
};

describe('createEngineCanvasBinding', () => {
    let engine: FlowEngine;
    let binding: CanvasBinding;

    beforeEach(() => {
        engine = createFlowEngine();
        // loadGraph clears history, so every undo assertion below measures the agent's own edit.
        engine.loadGraph(seed());
        binding = createEngineCanvasBinding(engine);
    });

    describe('readGraph', () => {
        it('returns the engine graph', () => {
            const graph = binding.readGraph();
            expect(graph.nodes.map(n => n.id)).toEqual([GEN, FETCH]);
            expect(graph.edges).toEqual([]);
        });

        it('reflects an edit made earlier in the same turn', () => {
            binding.updateNode(FETCH, { position: { x: 40, y: 40 } });
            expect(nodeOf(binding, FETCH).position).toEqual({ x: 40, y: 40 });
        });

        it('sees a change the engine made behind the binding', () => {
            engine.transact('node:add', ops => ops.addNode({ type: 'input-text', position: { x: 9, y: 9 } }));
            expect(binding.readGraph().nodes).toHaveLength(3);
        });
    });

    describe('updateNode — position', () => {
        it('replaces the position whole', () => {
            binding.updateNode(GEN, { position: { x: 210, y: 80 } });
            expect(nodeOf(binding, GEN).position).toEqual({ x: 210, y: 80 });
        });

        it('leaves every other field alone', () => {
            binding.updateNode(GEN, { position: { x: 210, y: 80 } });
            const node = nodeOf(binding, GEN);
            expect(node.customLabel).toBe('Draft');
            expect(node.config).toEqual({ model: 'gemini-2.5-flash', temperature: '0.7' });
        });
    });

    describe('updateNode — label', () => {
        it('sets customLabel', () => {
            binding.updateNode(GEN, { label: 'Summarize' });
            expect(nodeOf(binding, GEN).customLabel).toBe('Summarize');
        });

        it("clears the override on '' so the node falls back to its definition label", () => {
            binding.updateNode(GEN, { label: '' });
            expect(nodeOf(binding, GEN).customLabel).toBeUndefined();
        });
    });

    describe('updateNode — config', () => {
        it('merges, preserving keys the patch omits', () => {
            binding.updateNode(GEN, { config: { model: 'gemini-2.5-pro' } });
            // temperature was never mentioned and must survive.
            expect(nodeOf(binding, GEN).config).toEqual({ model: 'gemini-2.5-pro', temperature: '0.7' });
        });

        it('accumulates across calls within a turn', () => {
            binding.updateNode(GEN, { config: { temperature: '0.2' } });
            binding.updateNode(GEN, { config: { model: 'gemini-2.5-pro' } });
            expect(nodeOf(binding, GEN).config).toEqual({ model: 'gemini-2.5-pro', temperature: '0.2' });
        });

        it('adds a key to a node with empty config', () => {
            binding.updateNode(FETCH, { config: { url: 'https://example.com' } });
            expect(nodeOf(binding, FETCH).config).toEqual({ url: 'https://example.com' });
        });
    });

    describe('history — the reason this goes through transact', () => {
        it('makes one edit one undo step', () => {
            expect(engine.canUndo()).toBe(false);
            binding.updateNode(GEN, { position: { x: 210, y: 80 } });
            expect(engine.canUndo()).toBe(true);

            expect(engine.undo()).toBe(true);
            expect(nodeOf(binding, GEN).position).toEqual({ x: 200, y: 80 });
            expect(engine.canUndo()).toBe(false);
        });

        it('unwinds three edits one at a time, newest first', () => {
            binding.updateNode(GEN, { label: 'One' });
            binding.updateNode(GEN, { label: 'Two' });
            binding.updateNode(GEN, { label: 'Three' });

            engine.undo();
            expect(nodeOf(binding, GEN).customLabel).toBe('Two');
            engine.undo();
            expect(nodeOf(binding, GEN).customLabel).toBe('One');
            engine.undo();
            expect(nodeOf(binding, GEN).customLabel).toBe('Draft');
        });

        it('labels the checkpoint by what the patch touched', () => {
            const labels: string[] = [];
            engine.subscribe((event: EngineEvent) => {
                if (event.type === 'graph:changed') labels.push(event.label);
            });

            binding.updateNode(GEN, { position: { x: 1, y: 1 } });
            binding.updateNode(GEN, { label: 'Renamed' });
            binding.updateNode(GEN, { config: { temperature: '0.1' } });

            // Not three 'agent:move': the desktop ref this replaced hard-coded that one label.
            expect(labels).toEqual(['agent:move', 'agent:rename', 'agent:config']);
        });

        it('announces a committed change, so autosave and the draft see the edit', () => {
            const changed: string[] = [];
            engine.subscribe((event: EngineEvent) => {
                if (event.type === 'graph:changed') changed.push(event.label);
            });
            binding.updateNode(GEN, { label: 'Renamed' });
            expect(changed).toHaveLength(1);
        });
    });

    describe('run state is not an edit', () => {
        it('keeps runtime fields an edit did not mention', () => {
            engine.applyRuntime(GEN, { state: 'COMPLETED', outputData: { out: { type: 'text', value: 'hi' } } });
            binding.updateNode(GEN, { position: { x: 300, y: 120 } });

            const node = nodeOf(binding, GEN);
            expect(node.state).toBe('COMPLETED');
            expect(node.outputData).toEqual({ out: { type: 'text', value: 'hi' } });
            expect(node.position).toEqual({ x: 300, y: 120 });
        });

        it('does not let a run fill the undo stack the agent edit shares', () => {
            engine.applyRuntime(GEN, { state: 'RUNNING' });
            expect(engine.canUndo()).toBe(false);
        });
    });

    describe('a bad id fails loudly', () => {
        it('throws NODE_NOT_FOUND rather than silently doing nothing', () => {
            // The executor turns this into a tool error; swallowing it would report a move
            // that never happened.
            expect(() => binding.updateNode('n-missing', { position: { x: 1, y: 1 } })).toThrow(/n-missing/);
        });

        it('leaves the graph and history untouched when it throws', () => {
            expect(() => binding.updateNode('n-missing', { label: 'X' })).toThrow();
            expect(binding.readGraph().nodes.map(n => n.id)).toEqual([GEN, FETCH]);
            expect(engine.canUndo()).toBe(false);
        });
    });
});
