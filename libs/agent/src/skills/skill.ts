import type { CanvasBinding } from '../canvas/canvasBinding';
import type { CatalogLookup } from '../catalog';
import type { ToolProvider } from '../tools/types';

/** The live-canvas deps a skill's tools bind to — the subset of {@link BaseAgentDeps} a capability needs (no gateway/session). */
export interface SkillToolDeps {
    binding: CanvasBinding;
    catalog: CatalogLookup;
}

/**
 * A skill is one composable, self-contained capability: a name, a one-line description, and the tool
 * provider(s) that back it. It carries NO persona and NO workflow — each `ToolDef` already self-describes,
 * and the agent's persona owns the role and judgement. That passivity is what lets an agent compose several
 * skills, and lets one skill bundle several tools (a block's whole lifecycle) without becoming a mini-agent.
 * (Follows the Anthropic Agent Skills shape: name + description metadata, composable building blocks.)
 */
export interface Skill {
    /** Capability id, e.g. 'inspect', 'move', 'edge', 'lifecycle:buffer'. */
    name: string;
    /** One line: what this capability is (metadata, not a workflow). */
    description: string;
    /** The tool provider(s) backing the capability, bound to the live canvas. */
    createTools(deps: SkillToolDeps): ToolProvider[];
}

/** Flatten a set of skills into the tool providers an agent carries, preserving order. */
export const toolsFromSkills = (skills: Skill[], deps: SkillToolDeps): ToolProvider[] =>
    skills.flatMap(skill => skill.createTools(deps));
