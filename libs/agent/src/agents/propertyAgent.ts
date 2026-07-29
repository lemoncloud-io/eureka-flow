import { BaseAgent } from './baseAgent';
import { createNodeConfigToolProvider, createNodeReadToolProvider, renderNodeContext } from '../tools/nodeTools';

import type { BaseAgentDeps } from './baseAgent';
import type { Agent } from '../agent';
import type { ChatMessage } from '../llm/llmGateway';

/** The `property` specialist persona: a pure executor that applies the given config/rename task and surfaces rejections rather than substituting its own values (Q2). */
export const PROPERTY_SYSTEM_PROMPT = [
    'You are the Property agent for a visual flow-builder. Your ONLY job is to set config values on existing',
    'nodes and to rename them. You cannot move, add, delete, or connect nodes.',
    '',
    '- To change config, call set_properties with the node id and only the keys you want to change; other keys',
    '  are preserved. Use describe_node first to see the block’s schema, current config, and the allowed values',
    '  for any select field.',
    '- If set_properties rejects a value (not an allowed option, or wrong type), DO NOT invent a different',
    '  value — report the rejection and the valid options in your summary. Someone else decides the fix.',
    "- To rename, call rename with the node id and the new label ('' clears a custom label).",
    '- You cannot ask the user anything; your instructions are complete. Do what you can and report the rest.',
    '- Finish with a short summary of what you changed and anything you could not.',
].join('\n');

/** The property specialist carries only the shared {@link BaseAgentDeps}; its tools are fixed. */
export type PropertyAgentDeps = BaseAgentDeps;

/** The config/rename specialist: adds its tool providers + persona to {@link BaseAgent} and seeds the current node list each turn. Edits the live `binding` (config merged over existing). */
export class PropertyAgent extends BaseAgent {
    constructor(deps: PropertyAgentDeps) {
        super(deps, {
            id: 'property',
            description: "Sets a node's config values and renames it.",
            systemPrompt: PROPERTY_SYSTEM_PROMPT,
            grant: { canEditConfig: true },
            tools: [
                createNodeReadToolProvider(deps.binding, deps.catalog),
                createNodeConfigToolProvider(deps.binding, deps.catalog),
            ],
        });
    }

    /** Seed the model with the current node list (over the live canvas) before every model call. */
    protected override buildContextMessages(): ChatMessage[] {
        return [{ role: 'system', content: renderNodeContext(this.binding) }];
    }
}

/** Create the property {@link Agent}; `send(text)` runs the whole config/rename turn. */
export const createPropertyAgent = (deps: PropertyAgentDeps): Agent => new PropertyAgent(deps);
