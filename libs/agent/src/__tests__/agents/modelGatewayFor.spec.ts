import { describe, expect, it } from 'vitest';

import { agentModelResolver, createModelGatewayFor } from '../../agents/modelGatewayFor';
import { createAgentRoster } from '../../agents/roster';
import { createSubAgentRunner } from '../../agents/subAgentRunner';
import { withModels } from '../../agents/withModels';
import { createInMemoryCanvasBinding } from '../../canvas/inMemoryCanvasBinding';
import { createFakeGateway } from '../../llm/fakeGateway';

import type { Agent } from '../../agent';
import type { AgentRegistration } from '../../agents/roster';
import type { CatalogLookup } from '../../catalog';
import type { LlmGateway } from '../../llm/llmGateway';

const emptyCatalog: CatalogLookup = { has: () => false, schema: () => undefined, search: () => [] };
const noopBinding = createInMemoryCanvasBinding();
const noopAgent: Agent = { send: async () => undefined, abort: () => undefined };

// Two real manifest ids so withModels validation passes; distinct so routing is observable.
const PRO = 'gemini-2.5-pro';
const FLASH = 'gemini-2.5-flash';

describe('agentModelResolver — precedence', () => {
    const roster = createAgentRoster([
        { type: 'builder', summary: 'b', model: PRO, create: () => noopAgent },
        { type: 'plain', summary: 'p', create: () => noopAgent },
    ]);

    it('prefers a registration model over deployment config and default', () => {
        const resolve = agentModelResolver(roster, { builder: FLASH }, 'other');
        expect(resolve('builder')).toBe(PRO);
    });

    it('falls to deployment config by agentType when the registration declares none', () => {
        const resolve = agentModelResolver(roster, { plain: FLASH }, 'other');
        expect(resolve('plain')).toBe(FLASH);
    });

    it('falls to the deployment default for an unregistered/unconfigured type', () => {
        const resolve = agentModelResolver(roster, {}, FLASH);
        expect(resolve('some-block-type')).toBe(FLASH);
    });

    it('returns undefined (⇒ inherit) when nothing resolves', () => {
        const resolve = agentModelResolver(roster, {}, undefined);
        expect(resolve('plain')).toBeUndefined();
    });

    // Regression: a reasoning-tier type (e.g. the builder) must INHERIT the orchestrator, never fall
    // to the worker defaultModel — else a concrete AGENT_MODEL_DEFAULT silently downgrades the builder.
    describe('inheritTypes exemption from the defaultModel floor', () => {
        const bare = createAgentRoster([{ type: 'builder', summary: 'b', create: () => noopAgent }]);

        it('exempts an inherit type from defaultModel → resolves undefined (inherit)', () => {
            const resolve = agentModelResolver(bare, {}, FLASH, ['builder']);
            expect(resolve('builder')).toBeUndefined();
        });

        it('still applies defaultModel to non-inherit (worker) types', () => {
            const resolve = agentModelResolver(bare, {}, FLASH, ['builder']);
            expect(resolve('single-output-generator')).toBe(FLASH);
        });

        it('lets an explicit config/registration model override the inherit exemption', () => {
            expect(agentModelResolver(bare, { builder: PRO }, FLASH, ['builder'])('builder')).toBe(PRO);
        });
    });
});

describe('createModelGatewayFor — routing, memoization, inherit', () => {
    it('builds one gateway per model id, memoized, and inherits the default when unresolved', () => {
        const factoryCalls: string[] = [];
        const built = new Map<string, LlmGateway>();
        const gatewayFactory = (modelId: string): LlmGateway => {
            factoryCalls.push(modelId);
            const gw = createFakeGateway([]);
            built.set(modelId, gw);
            return gw;
        };
        const defaultGateway = createFakeGateway([]);
        const modelForType = (type: string) => (type === 'builder' ? PRO : undefined);

        const gatewayFor = createModelGatewayFor({ modelForType, defaultGateway, gatewayFactory });

        // resolved model → the factory's gateway, and the SAME instance on a second call (memoized).
        expect(gatewayFor('builder')).toBe(built.get(PRO));
        expect(gatewayFor('builder')).toBe(built.get(PRO));
        expect(factoryCalls).toEqual([PRO]); // built once despite two lookups

        // unresolved (inherit) → the default gateway; factory not consulted for it.
        expect(gatewayFor('block')).toBe(defaultGateway);
        expect(factoryCalls).toEqual([PRO]);
    });

    it('with no gatewayFactory, every agent inherits the default gateway (no behavior change)', () => {
        const defaultGateway = createFakeGateway([]);
        const gatewayFor = createModelGatewayFor({
            modelForType: () => PRO, // even with a resolved model…
            defaultGateway,
        });
        expect(gatewayFor('builder')).toBe(defaultGateway); // …no factory ⇒ inherit
        expect(gatewayFor('anything')).toBe(defaultGateway);
    });
});

describe('withModels — declarative config + fail-fast validation', () => {
    const base: AgentRegistration[] = [
        { type: 'builder', summary: 'b', create: () => noopAgent },
        { type: 'single-output-generator', summary: 'g', create: () => noopAgent },
    ];

    it('stamps the model onto matching registrations and leaves the rest model-free', () => {
        const stamped = withModels(base, { 'single-output-generator': FLASH });
        expect(stamped.find(r => r.type === 'single-output-generator')?.model).toBe(FLASH);
        expect(stamped.find(r => r.type === 'builder')?.model).toBeUndefined();
    });

    it('does not mutate the input registrations', () => {
        withModels(base, { builder: PRO });
        expect(base.find(r => r.type === 'builder')?.model).toBeUndefined();
    });

    it('validates every id in the map — including keys with no matching registration', () => {
        // 'buffer' has no registration but is still validated (the resolver reads it directly).
        expect(() => withModels(base, { buffer: 'not-a-real-model' })).toThrow(/Unknown model id/);
    });

    it('accepts a real manifest id', () => {
        expect(() => withModels(base, { builder: PRO })).not.toThrow();
    });
});

describe('per-agent model routing through the real sub-agent runner seam', () => {
    it('spawns each child on the gateway its resolved model selects; unset ⇒ inherit', async () => {
        const seen: Record<string, LlmGateway> = {};
        const capture = (type: string): AgentRegistration =>
            ({
                type,
                summary: `${type} recorder`,
                // registration.create receives the gateway subAgentRunner picked via gatewayFor(agentType).
                create: deps => {
                    seen[type] = deps.gateway;
                    return noopAgent;
                },
            }) as AgentRegistration;

        // builder declares PRO; generator inherits (no model).
        const roster = createAgentRoster(withModels([capture('builder'), capture('generator')], { builder: PRO }));

        const factoryBuilt = new Map<string, LlmGateway>();
        const gatewayFactory = (modelId: string): LlmGateway => {
            const gw = createFakeGateway([]);
            factoryBuilt.set(modelId, gw);
            return gw;
        };
        const defaultGateway = createFakeGateway([]);
        const gatewayFor = createModelGatewayFor({
            modelForType: agentModelResolver(roster, {}, undefined),
            defaultGateway,
            gatewayFactory,
        });

        const runner = createSubAgentRunner({
            roster,
            catalog: emptyCatalog,
            gatewayFor,
            flowId: 'flow-test',
            userPermissions: {},
        });

        await runner.fanOut(
            [
                { task: 'build', agentType: 'builder' },
                { task: 'generate', agentType: 'generator' },
            ],
            noopBinding
        );

        expect(seen.builder).toBe(factoryBuilt.get(PRO)); // routed to the PRO gateway
        expect(seen.generator).toBe(defaultGateway); // inherited the orchestrator's gateway
    });
});
