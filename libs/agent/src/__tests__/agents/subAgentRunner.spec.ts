import { describe, expect, it } from 'vitest';

import { createAgentRoster } from '../../agents/roster';
import { createSubAgentRunner } from '../../agents/subAgentRunner';
import { createFakeGateway } from '../../llm/fakeGateway';

import type { Agent } from '../../agent';
import type { AgentRegistration } from '../../agents/roster';
import type { CanvasBinding } from '../../canvas/canvasBinding';
import type { CatalogLookup } from '../../catalog';

const noopBinding: CanvasBinding = {
    readGraph: () => ({ nodes: [], edges: [] }),
    updateNode: () => {
        /* no-op */
    },
};
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
