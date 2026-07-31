import { describe, expect, it } from 'vitest';

import { createAgentRoster } from '../../agents/roster';
import { createSubAgentRunner } from '../../agents/subAgentRunner';
import { createInMemoryCanvasBinding } from '../../canvas/inMemoryCanvasBinding';
import { createFakeGateway } from '../../llm/fakeGateway';
import { createFixtureCatalog, makeInitialGraph } from '../harness/fixtures';

import type { Agent } from '../../agent';
import type { AgentRegistration } from '../../agents/roster';
import type { CatalogLookup } from '../../catalog';

// The roster/runner tests never write to the canvas — any binding that satisfies the interface does.
const noopBinding = createInMemoryCanvasBinding();
const emptyCatalog: CatalogLookup = { has: () => false, schema: () => undefined, search: () => [] };

const reg = (type: string, create: AgentRegistration['create']): AgentRegistration => ({
    type,
    summary: `${type} test agent`,
    create,
});

const makeRunner = (registrations: AgentRegistration[]) =>
    createSubAgentRunner({
        roster: createAgentRoster(registrations),
        catalog: emptyCatalog,
        gatewayFor: () => createFakeGateway([]),
        flowId: 'flow-test',
        userPermissions: {},
    });

describe('createSubAgentRunner — fanOut failure paths', () => {
    it('reports ok:false when no specialist of the requested type exists', async () => {
        const [result] = await makeRunner([]).fanOut([{ task: 'do it', agentType: 'ghost' }], noopBinding);
        expect(result).toEqual({ ok: false, summary: 'no specialist of type "ghost" is available' });
    });

    it('reports ok:false with the message when a child throws', async () => {
        const throwing: Agent = {
            send: async () => {
                throw new Error('kaboom');
            },
            abort: () => {
                /* no-op */
            },
        };
        const [result] = await makeRunner([reg('boom', () => throwing)]).fanOut(
            [{ task: 'do it', agentType: 'boom' }],
            noopBinding
        );
        expect(result).toEqual({ ok: false, summary: 'kaboom' });
    });

    it('threads the abort signal through to each spawned child', async () => {
        let childSawAborted: boolean | undefined;
        const recorder: Agent = {
            send: async (_task, opts) => {
                childSawAborted = opts?.signal?.aborted;
            },
            abort: () => {
                /* no-op */
            },
        };
        const controller = new AbortController();
        controller.abort();

        await makeRunner([reg('rec', () => recorder)]).fanOut(
            [{ task: 'x', agentType: 'rec' }],
            noopBinding,
            controller.signal
        );

        expect(childSawAborted).toBe(true);
    });
});

describe('createSubAgentRunner — generic block-agent fallback (hybrid roster)', () => {
    const catalog = createFixtureCatalog();
    const makeCatalogRunner = (registrations: AgentRegistration[], gateway: ReturnType<typeof createFakeGateway>) =>
        createSubAgentRunner({
            roster: createAgentRoster(registrations),
            catalog,
            gatewayFor: () => gateway,
            flowId: 'flow-test',
            userPermissions: { canModifyCanvas: true, canEditConfig: true },
        });

    it('synthesizes a generic BlockAgent for an unregistered but catalog-valid block type', async () => {
        const binding = createInMemoryCanvasBinding(makeInitialGraph());
        const gateway = createFakeGateway([
            { toolCalls: [{ name: 'add_node', args: { type: 'buffer', position: { x: 900, y: 120 } } }] },
            { text: 'added a buffer' },
        ]);

        // 'buffer' is NOT registered, but IS a catalog block → the runner builds BlockAgent('buffer') on the fly.
        const [result] = await makeCatalogRunner([], gateway).fanOut(
            [{ task: 'add a buffer at (900, 120)', agentType: 'buffer' }],
            binding
        );

        expect(result.ok).toBe(true);
        expect(binding.readGraph().nodes.filter(n => n.type === 'buffer')).toHaveLength(2); // fixture + the new one
    });

    it('lets an explicit registration win over the generic block fallback', async () => {
        let explicitRan = false;
        const explicit: Agent = {
            send: async () => {
                explicitRan = true;
            },
            abort: () => {
                /* no-op */
            },
        };

        // 'buffer' is BOTH registered AND a catalog type → the explicit registration must win over the generic.
        const [result] = await makeCatalogRunner([reg('buffer', () => explicit)], createFakeGateway([])).fanOut(
            [{ task: 'x', agentType: 'buffer' }],
            createInMemoryCanvasBinding(makeInitialGraph())
        );

        expect(explicitRan).toBe(true);
        expect(result.ok).toBe(true);
    });
});
