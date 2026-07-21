import { describe, expect, it } from 'vitest';

import { createInMemoryCanvasBinding, createInMemoryStorage, createLocatorAgent } from '@flows/agent';

import { createCommandLlmGateway } from '../../app/features/flows/utils/createCommandLlmGateway';

import type { NodeData } from '@lemoncloud/eureka-flows-api';

const node = (id: string, x: number, y: number, extra: Partial<NodeData> = {}): NodeData => ({
    id,
    type: 'test',
    position: { x, y },
    ...extra,
});

/** Run one command through the real agent + executor + in-memory canvas — no network. */
const run = async (nodes: NodeData[], command: string) => {
    const binding = createInMemoryCanvasBinding({ nodes, edges: [] });
    const storage = createInMemoryStorage();
    const agent = createLocatorAgent({ gateway: createCommandLlmGateway(), binding, storage, flowId: 'f' });
    await agent.send(command);
    return { binding, session: storage.load('f') };
};

describe('createCommandLlmGateway (full agent → executor → canvas pipeline, offline)', () => {
    it('moves a node up by a relative delta: move(Fetch, up, 10)', async () => {
        const { binding } = await run([node('n1', 200, 80, { customLabel: 'Fetch' })], 'move(Fetch, up, 10)');
        expect(binding.readGraph().nodes[0].position).toEqual({ x: 200, y: 70 });
    });

    it('moves a node to an absolute point: move(Email, to, 100, 200)', async () => {
        const { binding } = await run([node('n1', 0, 0, { customLabel: 'Email' })], 'move(Email, to, 100, 200)');
        expect(binding.readGraph().nodes[0].position).toEqual({ x: 100, y: 200 });
    });

    it('defaults the distance to DEFAULT_STEP (20) when omitted: move(Fetch, right)', async () => {
        const { binding } = await run([node('n1', 0, 0, { customLabel: 'Fetch' })], 'move(Fetch, right)');
        expect(binding.readGraph().nodes[0].position).toEqual({ x: 20, y: 0 });
    });

    it('matches by type when there is no custom label', async () => {
        const { binding } = await run([node('n1', 0, 0, { type: 'http' })], 'move(http, down, 5)');
        expect(binding.readGraph().nodes[0].position).toEqual({ x: 0, y: 5 });
    });

    it('does not move and replies when the target is unknown', async () => {
        const { binding, session } = await run([node('n1', 5, 5, { customLabel: 'Fetch' })], 'move(Nope, up, 10)');
        expect(binding.readGraph().nodes[0].position).toEqual({ x: 5, y: 5 });
        expect(session?.messages.at(-1)?.content).toMatch(/couldn't find/i);
    });

    it('does not fuzzy-match a partial name onto a real node (regression: "Beta" ≠ "Betamax")', async () => {
        const { binding, session } = await run(
            [node('n1', 0, 0, { customLabel: 'Alpha' }), node('n2', 5, 5, { customLabel: 'Betamax' })],
            'move(Beta, up, 10)'
        );
        // Neither node moves — a partial/non-existent target must report "not found", not guess.
        expect(binding.readGraph().nodes[0].position).toEqual({ x: 0, y: 0 });
        expect(binding.readGraph().nodes[1].position).toEqual({ x: 5, y: 5 });
        expect(session?.messages.at(-1)?.content).toMatch(/couldn't find/i);
    });

    it('does not move and asks when the target is ambiguous', async () => {
        const { binding, session } = await run(
            [node('n1', 0, 0, { type: 'http' }), node('n2', 9, 9, { type: 'http' })],
            'move(http, up, 10)'
        );
        expect(binding.readGraph().nodes[0].position).toEqual({ x: 0, y: 0 });
        expect(binding.readGraph().nodes[1].position).toEqual({ x: 9, y: 9 });
        expect(session?.messages.at(-1)?.content).toMatch(/more than one/i);
    });

    it('lists the nodes it can see via the `list` command', async () => {
        const { session } = await run(
            [node('n1', 0, 0, { customLabel: 'Fetch' }), node('n2', 5, 5, { customLabel: 'Email' })],
            'list'
        );
        const reply = session?.messages.at(-1)?.content ?? '';
        expect(reply).toMatch(/I can see 2 node\(s\)/i);
        expect(reply).toContain('Fetch');
        expect(reply).toContain('Email');
    });

    it('reports an empty canvas for `list` when there are no nodes', async () => {
        const { session } = await run([], 'list');
        expect(session?.messages.at(-1)?.content).toMatch(/no nodes on the canvas/i);
    });
});
