import { BaseAgent } from './baseAgent';
import {
    DESCRIBE_NODE,
    SEARCH_NODES,
    SET_PROPERTIES,
    listNodeLocationsOfType,
    renderNodeContext,
} from '../tools/nodeTools';
import { toolset } from '../tools/toolset';

import type { BaseAgentDeps } from './baseAgent';
import type { Agent } from '../agent';
import type { ChatMessage } from '../llm/llmGateway';

/**
 * The generic per-block persona: one agent CONFIGURES the content of one block type — it sets the fields of an
 * existing node of its type, and nothing else. Its reads are type-scoped (`search_nodes` only lists its own
 * type). It validates against the block's schema and REPORTS rejections rather than inventing a value (the
 * Q2/Q4 contract). It does NOT add, delete, rename, move, or wire nodes — the builder shapes the flow; the
 * block agent tunes the nodes it places.
 */
export const blockAgentSystemPrompt = (type: string, label: string): string =>
    [
        `You are the ${label} agent for a visual flow-builder. You configure ${label} (\`${type}\`) nodes — you`,
        `set the fields of an existing ${label} node, and nothing else: you handle only \`${type}\` nodes, and you`,
        'never add, delete, rename, move, or connect them (the builder shapes the flow; you tune the nodes it places).',
        '',
        'How to work:',
        `- Use the ${label} schema (seeded below, and you can inspect any node for its full detail) to MAP the`,
        '  user\'s wording onto the block\'s real fields and allowed values — a field the user calls "temperature"',
        '  may be named `temp`; a loose ask like "a bit more" onto the field and value that express it. Resolving',
        '  intent to the schema is your job, not guesswork. Change only what the task asks for; leave the rest.',
        '- If a field is genuinely not in the schema, or a value is not allowed, the edit is rejected. Do NOT',
        '  invent or substitute a value — report what was rejected and the valid options, and leave the fix to',
        '  whoever briefed you.',
        '- When a task names a node by description rather than id, find the matching one among your own first.',
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
 * The generic block specialist: a type-scoped read (`search_nodes` + `describe_node`) + config
 * (`set_properties`) over the live `binding`. It configures existing nodes only — no add/delete (the builder
 * shapes the flow) and no rename (the builder labels) — so its sole write is `set_properties` and its grant is
 * just `canEditConfig`. Its persona + seeded context are parameterized by `blockType`.
 */
export class BlockAgent extends BaseAgent {
    private readonly blockType: string;
    private readonly blockLabel: string;

    constructor(deps: BlockAgentDeps) {
        const label = deps.catalog.schema(deps.blockType)?.label ?? deps.blockType;
        super(deps, {
            id: `block:${deps.blockType}`,
            description: `Configures ${label} (${deps.blockType}) nodes.`,
            systemPrompt: blockAgentSystemPrompt(deps.blockType, label),
            grant: { canEditConfig: true },
            tools: [
                // Configure-only, selected by identity: type-scoped search + describe + the one write.
                toolset({ binding: deps.binding, catalog: deps.catalog, searchType: deps.blockType }, [
                    SEARCH_NODES,
                    DESCRIBE_NODE,
                    SET_PROPERTIES,
                ]),
            ],
        });
        this.blockType = deps.blockType;
        this.blockLabel = label;
    }

    /**
     * Seed this block type's own nodes + config schema into the per-turn head — a short specialist keeps the
     * live canvas in the head each turn rather than pulling it. Type-scoped: it only ever sees its own type.
     */
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

/** Create a generic block {@link Agent} for `deps.blockType`; `send(text)` runs one configure turn. */
export const createBlockAgent = (deps: BlockAgentDeps): Agent => new BlockAgent(deps);
