/**
 * The shipped HYBRID orchestrator: ONE system prompt
 * that splits a request by the KIND of work — the whole STRUCTURE to the builder as one plan, each node's
 * CONTENT to that block's own specialist by its type string. The routing lives in the prompt itself;
 * renderRoster just lists the available specialists in the head context. Offline: pure over the constant + roster.
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_REGISTRATIONS, createAgentRoster } from '../../../agents';
import { ORCHESTRATOR_SYSTEM_PROMPT, renderRoster } from '../../../agents/orchestratorAgent';

const defaultRoster = createAgentRoster(DEFAULT_REGISTRATIONS);

describe('the orchestrator prompt routes by kind of work', () => {
    it('sends structural / wiring work to the builder as one plan', () => {
        expect(ORCHESTRATOR_SYSTEM_PROMPT).toMatch(/coordinated job for the builder/);
        expect(ORCHESTRATOR_SYSTEM_PROMPT).toMatch(/SINGLE delegation/);
    });

    it('routes naming / relabeling to the builder (part of the build), not as per-node content', () => {
        expect(ORCHESTRATOR_SYSTEM_PROMPT).toMatch(/naming\/relabeling nodes/);
        expect(ORCHESTRATOR_SYSTEM_PROMPT).toMatch(/renaming belongs to the build/);
    });

    it("sends a node's content to that block's own specialist, addressed by its type string", () => {
        expect(ORCHESTRATOR_SYSTEM_PROMPT).toMatch(/CONTENT/);
        expect(ORCHESTRATOR_SYSTEM_PROMPT).toMatch(/TYPE STRING/);
        expect(ORCHESTRATOR_SYSTEM_PROMPT).toMatch(/single-output-generator/); // the type string, not a "block" alias
        expect(ORCHESTRATOR_SYSTEM_PROMPT).toMatch(/in parallel/);
    });

    it('stays write-free and keeps the planning discipline', () => {
        expect(ORCHESTRATOR_SYSTEM_PROMPT).toMatch(/do NOT edit the canvas yourself/);
        expect(ORCHESTRATOR_SYSTEM_PROMPT).toMatch(/Target/);
        expect(ORCHESTRATOR_SYSTEM_PROMPT).toMatch(/Shared values/);
    });
});

describe('renderRoster lists the available specialists in the head context', () => {
    it('renders just the roster — the dynamic data the prompt’s routing refers to', () => {
        const ctx = renderRoster(defaultRoster);
        expect(ctx).toContain('Available specialists:');
        expect(ctx).toContain('builder'); // the structural writer
        expect(ctx).toContain('single-output-generator'); // a content specialist
    });
});
