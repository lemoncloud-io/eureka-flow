import { describe, expect, it } from 'vitest';

import { createInMemoryCanvasBinding } from '../../canvas/inMemoryCanvasBinding';
import { createCatalogLookup } from '../../catalog';
import { createTerminalRun } from '../../cli/terminalRun';
import { createFakeGateway } from '../../llm/fakeGateway';

import type { Graph } from '../../canvas';

const seeded = (): Graph => ({
    nodes: [{ id: 'n1', type: 'input-text', position: { x: 0, y: 0 }, config: {} }],
    edges: [],
});

/** A driver over a fake, text-only orchestrator turn (no tools) — exercises the store→onChange→graph wiring. */
const makeRun = (reply: string, seed: Graph = seeded()) =>
    createTerminalRun({
        gateway: createFakeGateway([{ text: reply }]),
        binding: createInMemoryCanvasBinding(structuredClone(seed)),
        catalog: createCatalogLookup([]),
        userPermissions: { canModifyCanvas: true, canEditConfig: true },
    });

describe('createTerminalRun (driver over the orchestrator)', () => {
    it('emits state changes through onChange, each with the freshly-read graph', async () => {
        const run = makeRun('I see one node on the canvas.');
        const seen: { phase: string; messages: number; nodes: number }[] = [];
        run.onChange((state, graph) =>
            seen.push({ phase: state.phase, messages: state.messages.length, nodes: graph.nodes.length })
        );

        await run.submit('what is on the canvas?');

        // The turn settled done, and the final reply is the fake text.
        expect(run.getState()?.phase).toBe('done');
        const finalReply = run.getState()?.messages.at(-1);
        expect(finalReply?.role).toBe('assistant');
        expect(finalReply?.content).toContain('one node');

        // onChange fired during the turn: a thinking emission, then a done emission.
        expect(seen.some(e => e.phase === 'thinking')).toBe(true);
        expect(seen.at(-1)?.phase).toBe('done');
        // Every emission carried the live graph (the one seeded node).
        expect(seen.every(e => e.nodes === 1)).toBe(true);
        expect(run.getGraph().nodes).toHaveLength(1);
    });

    it('reset clears the session and redraws an empty state', async () => {
        const run = makeRun('hi');
        await run.submit('hello');
        expect(run.getState()?.messages.length).toBeGreaterThan(0);

        const afterReset: { phase: string; messages: number }[] = [];
        run.onChange(state => afterReset.push({ phase: state.phase, messages: state.messages.length }));
        run.reset();

        expect(run.getState()).toBeNull(); // no turn yet
        expect(afterReset.at(-1)).toEqual({ phase: 'idle', messages: 0 });
    });

    it('onChange returns an unsubscribe that stops further notifications', async () => {
        const run = makeRun('ok');
        let calls = 0;
        const off = run.onChange(() => (calls += 1));
        off();
        await run.submit('anything');
        expect(calls).toBe(0);
    });

    it('reset re-seeds the canvas through the injected loadGraph (seed, then the empty default)', () => {
        const seeded: Graph[] = [];
        const run = createTerminalRun({
            gateway: createFakeGateway([{ text: 'ok' }]),
            binding: createInMemoryCanvasBinding({ nodes: [], edges: [] }),
            catalog: createCatalogLookup([]),
            userPermissions: { canModifyCanvas: true, canEditConfig: true },
            loadGraph: graph => seeded.push(graph),
        });

        const seed: Graph = {
            nodes: [{ id: 'x', type: 'input-text', position: { x: 0, y: 0 }, config: {} }],
            edges: [],
        };
        run.reset(seed);
        expect(seeded.at(-1)).toEqual(seed);

        run.reset(); // bare reset → the `seed ?? empty` default
        expect(seeded.at(-1)).toEqual({ nodes: [], edges: [] });
    });
});
