/**
 * Isolation fix (design §1, §5.2): the orchestrator derives BOTH its routing rule and its base system prompt
 * from the roster it holds. A builder-exclusive roster gets BUILDER_RULE + the builder orchestrator prompt (all
 * node & wiring work → the one builder, handed a complete plan); every roster that carries a non-builder
 * specialist — fan-out AND the shipped default — keeps BLOCK_RULE + the fan-out (decompose) prompt verbatim, so
 * production routing is unchanged. Offline: pure over the roster, no gateway, no network.
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_REGISTRATIONS, createAgentRoster } from '../../../agents';
import {
    BLOCK_RULE,
    BUILDER_ORCHESTRATOR_SYSTEM_PROMPT,
    BUILDER_RULE,
    ORCHESTRATOR_SYSTEM_PROMPT,
    orchestratorPromptFor,
    renderContext,
    routingRuleFor,
} from '../../../agents/orchestratorAgent';
import { createInMemoryCanvasBinding } from '../../../canvas';

const builderRoster = createAgentRoster(DEFAULT_REGISTRATIONS.filter(r => r.type === 'builder'));
const fanoutRoster = createAgentRoster(DEFAULT_REGISTRATIONS.filter(r => r.type !== 'builder'));
const defaultRoster = createAgentRoster(DEFAULT_REGISTRATIONS);

describe('orchestrator routing rule — derived from the roster', () => {
    it('a builder-exclusive roster gets BUILDER_RULE', () => {
        expect(routingRuleFor(builderRoster)).toBe(BUILDER_RULE);
    });

    it('a fan-out roster (non-builder specialists) keeps BLOCK_RULE', () => {
        expect(routingRuleFor(fanoutRoster)).toBe(BLOCK_RULE);
    });

    it('the shipped default roster keeps BLOCK_RULE — production routing is unchanged', () => {
        expect(routingRuleFor(defaultRoster)).toBe(BLOCK_RULE);
    });

    it('the two rules are distinct, non-empty strings and BUILDER_RULE names the builder', () => {
        expect(BLOCK_RULE).not.toBe(BUILDER_RULE);
        expect(BLOCK_RULE.length).toBeGreaterThan(0);
        expect(BUILDER_RULE.length).toBeGreaterThan(0);
        expect(BUILDER_RULE).toMatch(/builder/);
    });
});

// The integration point §5.2 names explicitly: routingRuleFor must actually be what renderContext emits, so a
// revert to embedding a rule literally (making routingRuleFor dead code) is caught here, not just in the unit above.
describe('renderContext emits the selected rule into the orchestrator context (§5.2)', () => {
    const binding = createInMemoryCanvasBinding({ nodes: [], edges: [] });

    it('a builder-exclusive roster: the context carries BUILDER_RULE, not the generic-block paragraph', () => {
        const ctx = renderContext(binding, builderRoster);
        expect(ctx).toContain(BUILDER_RULE);
        expect(ctx).not.toContain(BLOCK_RULE);
        expect(ctx).not.toMatch(/generic block agent/); // BLOCK_RULE's tell — absent under a builder-only roster
    });

    it('fan-out and the shipped default: the context carries BLOCK_RULE, not BUILDER_RULE', () => {
        for (const roster of [fanoutRoster, defaultRoster]) {
            const ctx = renderContext(binding, roster);
            expect(ctx).toContain(BLOCK_RULE);
            expect(ctx).not.toContain(BUILDER_RULE);
        }
    });
});

// The base system prompt is chosen by the SAME builder-exclusive gate: fan-out decomposes into small
// per-specialist tasks; the builder orchestrator hands the one Builder a complete plan. The two strategies
// therefore brief with their own mental model, while the shipped default (mixed roster) keeps the fan-out prompt.
describe('orchestrator base prompt — derived from the roster', () => {
    it('a builder-exclusive roster gets the builder orchestrator prompt', () => {
        expect(orchestratorPromptFor(builderRoster)).toBe(BUILDER_ORCHESTRATOR_SYSTEM_PROMPT);
    });

    it('fan-out and the shipped default get the fan-out orchestrator prompt — production is unchanged', () => {
        expect(orchestratorPromptFor(fanoutRoster)).toBe(ORCHESTRATOR_SYSTEM_PROMPT);
        expect(orchestratorPromptFor(defaultRoster)).toBe(ORCHESTRATOR_SYSTEM_PROMPT);
    });

    it('the two prompts are distinct: fan-out decomposes, the builder gets one whole plan', () => {
        expect(ORCHESTRATOR_SYSTEM_PROMPT).not.toBe(BUILDER_ORCHESTRATOR_SYSTEM_PROMPT);
        expect(ORCHESTRATOR_SYSTEM_PROMPT).toMatch(/smallest self-contained tasks/); // fan-out's tell
        expect(BUILDER_ORCHESTRATOR_SYSTEM_PROMPT).toMatch(/single delegation/); // builder's tell
        expect(BUILDER_ORCHESTRATOR_SYSTEM_PROMPT).not.toMatch(/smallest self-contained tasks/);
    });

    it('both prompts share the planning tail (target · shared values)', () => {
        for (const p of [ORCHESTRATOR_SYSTEM_PROMPT, BUILDER_ORCHESTRATOR_SYSTEM_PROMPT]) {
            expect(p).toMatch(/Target/);
            expect(p).toMatch(/Shared values/);
        }
    });
});
