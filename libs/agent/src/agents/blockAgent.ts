import { BaseAgent } from './baseAgent';
import {
    createNodeConfigToolProvider,
    createNodeSearchToolProvider,
    createNodeStructureToolProvider,
    listNodeLocationsOfType,
    renderNodeContext,
} from '../tools/nodeTools';

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
        `nodes — you create, configure, rename, and delete them, and nothing else: you handle only \`${type}\``,
        'nodes, and you never move or connect nodes (other specialists do that).',
        '',
        'How to work:',
        '- Take the fewest steps that satisfy the intent: when a new node needs non-default values, give it those',
        '  values as you create it rather than creating it and then reconfiguring.',
        `- Use the ${label} schema (seeded below, and you can inspect any node for its full detail) to MAP the`,
        '  user\'s wording onto the block\'s real fields and allowed values — a field the user calls "temperature"',
        '  may be named `temp`; a loose ask like "a bit more" onto the field and value that express it. Resolving',
        '  intent to the schema is your job, not guesswork. Change only what the task asks for; leave the rest.',
        '- If a field is genuinely not in the schema, or a value is not allowed, the edit is rejected. Do NOT',
        '  invent or substitute a value — report what was rejected and the valid options, and leave the fix to',
        '  whoever briefed you.',
        '- When a task names a node by description rather than id, find the matching one among your own first.',
        '- Deleting a node also removes its connected edges — say which were dropped.',
        '',
        'You cannot ask the user anything and cannot see the conversation; your briefing is complete. Do everything',
        'you can, then finish with a short summary of what you changed and anything you could not.',
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
            tools: [
                createNodeSearchToolProvider(deps.binding, deps.catalog, { type: deps.blockType }),
                createNodeStructureToolProvider(deps.binding, deps.catalog),
                createNodeConfigToolProvider(deps.binding, deps.catalog),
            ],
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
