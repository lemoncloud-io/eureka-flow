import { BaseAgent } from './baseAgent';
import { lifecycleSkill, toolsFromSkills } from '../skills';
import { listNodeLocationsOfType, renderNodeContext } from '../tools/nodeTools';

import type { BaseAgentDeps } from './baseAgent';
import type { Agent } from '../agent';
import type { ChatMessage } from '../llm/llmGateway';

/**
 * The generic per-block persona: one agent OWNS one block type end-to-end — add, configure, rename, delete a
 * node of that type. Its reads are type-scoped (`search_nodes` only lists its own type). It validates against
 * the block's schema and REPORTS rejections rather than inventing a value (the Q2/Q4 contract).
 */
export const blockAgentSystemPrompt = (type: string, label: string): string =>
    [
        `You are the ${label} agent for a visual flow-builder. You own the whole lifecycle of ${label} (\`${type}\`)`,
        `nodes: you add them, configure them, rename them, and delete them. You handle ONLY \`${type}\` nodes — no`,
        'other block type, and you cannot move or connect nodes (other specialists do those).',
        '',
        `- To add one, call add_node with type "${type}" and the given position. It is created with the block's`,
        '  default config only; set non-default values afterwards with set_properties.',
        '- To change config, call set_properties with the node id and ONLY the keys you want to change; other keys',
        '  are preserved. Check the schema (seeded below, or via describe_node) for the allowed fields and values.',
        '- If set_properties rejects a value (unknown key, not an allowed option, wrong type), DO NOT invent a',
        '  different value — report the rejection and the valid options in your summary. Someone else decides the fix.',
        "- To rename, call rename with the node id and the new label ('' clears a custom label).",
        '- To delete, call delete_node with its id; its connected edges cascade — say which were dropped.',
        '- search_nodes lists only YOUR block type; use it to find the node id when one is not given.',
        '- You cannot ask the user anything; your instructions are complete. Do what you can and report the rest.',
        '- Finish with a short summary of what you changed and anything you could not.',
    ].join('\n');

/** A block agent carries the shared deps plus the ONE block type it manages. */
export interface BlockAgentDeps extends BaseAgentDeps {
    /** The block type this agent owns (e.g. 'buffer', 'output-preview', 'single-output-generator'). */
    blockType: string;
}

/**
 * The generic block specialist: type-scoped read + structure (add/delete) + config (set_properties/rename)
 * providers over the live `binding`. Grant is the union of what add/delete and config need
 * (`canModifyCanvas` + `canEditConfig`). Its persona + seeded context are parameterized by `blockType`.
 */
export class BlockAgent extends BaseAgent {
    private readonly blockType: string;
    private readonly blockLabel: string;

    constructor(deps: BlockAgentDeps) {
        const label = deps.catalog.schema(deps.blockType)?.label ?? deps.blockType;
        super(deps, {
            id: `block:${deps.blockType}`,
            description: `Creates, configures, renames, and deletes ${label} (${deps.blockType}) nodes.`,
            systemPrompt: blockAgentSystemPrompt(deps.blockType, label),
            grant: { canModifyCanvas: true, canEditConfig: true },
            tools: toolsFromSkills([lifecycleSkill(deps.blockType)], { binding: deps.binding, catalog: deps.catalog }),
        });
        this.blockType = deps.blockType;
        this.blockLabel = label;
    }

    /** Seed ONLY this block type's nodes + the block's config schema before every model call. */
    protected override buildContextMessages(): ChatMessage[] {
        const nodes = renderNodeContext(
            this.binding,
            {
                heading: `Your ${this.blockLabel} (${this.blockType}) nodes on the canvas:`,
                empty: `No ${this.blockLabel} (${this.blockType}) nodes on the canvas yet.`,
            },
            listNodeLocationsOfType(this.binding, this.blockType)
        );
        const schema = this.catalog.schema(this.blockType);
        const schemaBlock = schema
            ? `\n\nThe ${this.blockLabel} config schema (fields + any allowed options):\n${JSON.stringify(schema.config)}`
            : '';
        return [{ role: 'system', content: `${nodes}${schemaBlock}` }];
    }
}

/** Create a generic block {@link Agent} for `deps.blockType`; `send(text)` runs one add/configure/rename/delete turn. */
export const createBlockAgent = (deps: BlockAgentDeps): Agent => new BlockAgent(deps);
