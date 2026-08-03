/**
 * Skills foundation: the `use_skill` tool realizes Claude Code's progressive disclosure in process — the
 * name+description INDEX is always in context (the tool description), the instructions BODY loads only on
 * demand. Verified at the provider layer and end-to-end through the BaseAgent loop.
 */
import { describe, expect, it } from 'vitest';

import { BaseAgent } from '../../agents/baseAgent';
import { createInMemoryCanvasBinding } from '../../canvas/inMemoryCanvasBinding';
import { createFakeGateway } from '../../llm/fakeGateway';
import { createInMemorySessionStore } from '../../session/session';
import {
    SEED_SKILLS,
    USE_SKILL_TOOL,
    buildLinearPipelineSkill,
    configureGeneratorSkill,
    createUseSkillToolProvider,
} from '../../skills';
import { createFixtureCatalog } from '../harness/fixtures';

import type { BaseAgentDeps } from '../../agents/baseAgent';
import type { Skill } from '../../skills';
import type { ToolCall } from '../../tools/types';

const call = (name: string, args: unknown): ToolCall => ({ id: `c-${name}`, name, args });

describe('createUseSkillToolProvider — the index (Level 1)', () => {
    it('exposes only use_skill, whose description lists every skill name+description but NO instructions body', async () => {
        const defs = await createUseSkillToolProvider(SEED_SKILLS).listTools();
        expect(defs.map(d => d.name)).toEqual([USE_SKILL_TOOL]);

        const desc = defs[0].description;
        for (const s of SEED_SKILLS) {
            expect(desc).toContain(s.name);
            expect(desc).toContain(s.description);
            expect(desc).not.toContain(s.instructions); // the body is NOT in the always-in-context index
        }
        // selection is constrained to real skills
        const nameParam = (defs[0].parameters.properties as Record<string, { enum?: string[] }>).name;
        expect(nameParam.enum).toEqual(SEED_SKILLS.map(s => s.name));
    });
});

describe('createUseSkillToolProvider — the body on demand (Level 2)', () => {
    it('returns the chosen skill instructions', async () => {
        const provider = createUseSkillToolProvider(SEED_SKILLS);
        const res = await provider.dispatch(call(USE_SKILL_TOOL, { name: 'configure-generator' }));
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.data).toEqual({
                name: 'configure-generator',
                instructions: configureGeneratorSkill.instructions,
            });
        }
    });

    it('errors on an unknown skill name', async () => {
        const provider = createUseSkillToolProvider(SEED_SKILLS);
        const res = await provider.dispatch(call(USE_SKILL_TOOL, { name: 'nope' }));
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.error).toMatch(/no skill named "nope"/);
        }
    });
});

describe('createUseSkillToolProvider — fail loud at construction', () => {
    it('rejects a duplicate skill name', () => {
        expect(() => createUseSkillToolProvider([buildLinearPipelineSkill, buildLinearPipelineSkill])).toThrow(
            /duplicate skill name/
        );
    });

    it('rejects empty instructions', () => {
        expect(() => createUseSkillToolProvider([{ name: 'x', description: 'a skill', instructions: '   ' }])).toThrow(
            /empty instructions/
        );
    });
});

/** A minimal agent carrying ONLY use_skill — the smallest thing that exercises disclosure through the loop. */
class SkillOnlyAgent extends BaseAgent {
    constructor(deps: BaseAgentDeps, skills: Skill[]) {
        super(deps, {
            id: 'skill-test',
            description: 'loads skills',
            systemPrompt: 'You can load a skill with use_skill, then follow its instructions.',
            grant: {},
            tools: [createUseSkillToolProvider(skills)],
        });
    }
}

describe('use_skill — progressive disclosure through the BaseAgent loop', () => {
    it('offers the index every turn but the body enters context only after use_skill is called', async () => {
        const gateway = createFakeGateway([
            { toolCalls: [{ name: USE_SKILL_TOOL, args: { name: 'build-linear-pipeline' } }] },
            { text: 'Loaded the playbook; proceeding.' },
        ]);
        const agent = new SkillOnlyAgent(
            {
                gateway,
                storage: createInMemorySessionStore(),
                flowId: 'flow-1',
                binding: createInMemoryCanvasBinding(),
                catalog: createFixtureCatalog(),
                userPermissions: {},
            },
            SEED_SKILLS
        );

        await agent.send('build me a pipeline');

        const marker = 'Assemble a linear flow'; // a phrase unique to build-linear-pipeline's BODY (not its description)

        // Iteration 1: use_skill is offered, but its body is not yet in the transcript.
        const turn1 = gateway.calls[0];
        expect(turn1.tools?.map(t => t.name)).toContain(USE_SKILL_TOOL);
        expect(JSON.stringify(turn1.messages)).not.toContain(marker);

        // Iteration 2: the loaded instructions body is now in context (as the use_skill tool result).
        const turn2 = gateway.calls[1];
        expect(JSON.stringify(turn2.messages)).toContain(marker);
    });
});
