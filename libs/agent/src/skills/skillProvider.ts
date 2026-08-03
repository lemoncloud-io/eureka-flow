import { toolErr, toolOk, toolUnknown } from '../tools/types';

import type { Skill } from './skill';
import type { ToolDef } from '../llm/llmGateway';
import type { ToolCall, ToolProvider, ToolResult } from '../tools/types';

/** The tool the model calls to load a skill's instructions on demand. */
export const USE_SKILL_TOOL = 'use_skill';

/**
 * Progressive disclosure in process (the Claude Code Agent Skills mechanism, no filesystem): ONE `use_skill`
 * tool whose DESCRIPTION carries the always-in-context INDEX — each skill's `name` + `description`, the cheap
 * router — and whose dispatch returns the chosen skill's `instructions` ON DEMAND (the payload, absent from
 * context until invoked). The model matches a task to a description, calls `use_skill`, then follows the
 * returned instructions. Because `BaseAgent` re-sends tool defs every iteration and feeds tool results back,
 * disclosure needs no loop change — this is an ordinary `ToolProvider` an agent lists in `AgentConfig.tools`.
 *
 * Carried by the Builder (the shipped composition specialist) over SEED_SKILLS; the block/operation
 * specialists wire their tool providers directly and do not use it. Design: docs/browser-agent/design/skills.md.
 */
export const createUseSkillToolProvider = (skills: Skill[]): ToolProvider => {
    const byName = new Map<string, Skill>();
    for (const skill of skills) {
        if (byName.has(skill.name)) {
            throw new Error(`use_skill: duplicate skill name "${skill.name}"`);
        }
        if (!skill.instructions.trim()) {
            throw new Error(`use_skill: skill "${skill.name}" has empty instructions`);
        }
        byName.set(skill.name, skill);
    }

    const index = skills.map(s => `- ${s.name}: ${s.description}`).join('\n');
    const def: ToolDef = {
        name: USE_SKILL_TOOL,
        description:
            'Before acting, load the skill whose description matches your task: it returns a set of ' +
            'instructions to follow for that kind of work. Load one only when it fits; otherwise proceed ' +
            `without it.\nAvailable skills:\n${index}`,
        parameters: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'The skill to load.', enum: skills.map(s => s.name) },
            },
            required: ['name'],
        },
    };

    return {
        listTools: () => [def],
        dispatch: (call: ToolCall): ToolResult => {
            if (call.name !== USE_SKILL_TOOL) {
                return toolUnknown(call);
            }
            const { name } = (call.args ?? {}) as { name?: string };
            const skill = name ? byName.get(name) : undefined;
            if (!skill) {
                return toolErr(call, `no skill named "${name ?? ''}"`);
            }
            return toolOk(call, { name: skill.name, instructions: skill.instructions });
        },
    };
};
