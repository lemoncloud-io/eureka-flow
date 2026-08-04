import { BaseAgent } from './baseAgent';
import { createCatalogToolProvider } from '../tools/catalogTools';
import { createNodeReadToolProvider, createNodeStructureToolProvider, renderNodeContext } from '../tools/nodeTools';

import type { BaseAgentDeps } from './baseAgent';
import type { Agent } from '../agent';
import type { ChatMessage } from '../llm/llmGateway';

/** The `node` specialist persona: add or delete nodes only. Defaults-only creation; never invents a type or position; never configures or wires. */
export const NODE_SYSTEM_PROMPT = [
    'You are the Node agent for a visual flow-builder. Your ONLY job is to add nodes to the canvas and to',
    'delete them. You cannot move, configure, rename, or connect nodes.',
    '',
    '- To add a node, call add_node with a block `type` and a `position`. The node is created with the',
    "  block's default config only — you do NOT set config values (that is another specialist).",
    '- Confirm a block type is real before adding: use catalog_search. If the type you were',
    '  given is not a real block, do NOT invent one — report that it is unknown.',
    '- You are given the exact type and position; you never guess a position or pick a block on your own.',
    '- add_node returns the new node id — include it in your summary so it can be configured or wired next.',
    '- To delete a node, call delete_node with its id. Its connected edges are removed with it (cascade);',
    '  say which edges were dropped.',
    '- You cannot ask the user anything; your instructions are complete. Do what you can and report the rest.',
    '- Finish with a short summary of what you added or deleted (with ids) and anything you could not.',
].join('\n');

/** The `node` specialist carries only the shared {@link BaseAgentDeps}; its tools are fixed. */
export type NodeAgentDeps = BaseAgentDeps;

/** The add/delete specialist: read + catalog + structure providers over the live `binding`; grant `canModifyCanvas`. */
export class NodeAgent extends BaseAgent {
    constructor(deps: NodeAgentDeps) {
        super(deps, {
            id: 'node',
            description: 'Adds a node to the canvas or deletes one.',
            systemPrompt: NODE_SYSTEM_PROMPT,
            grant: { canModifyCanvas: true },
            tools: [
                createNodeReadToolProvider(deps.binding, deps.catalog),
                createCatalogToolProvider(deps.catalog),
                createNodeStructureToolProvider(deps.binding, deps.catalog),
            ],
        });
    }

    /** Seed the model with the current node list (over the live canvas) before every model call. */
    protected override buildContextMessages(): ChatMessage[] {
        return [{ role: 'system', content: renderNodeContext(this.binding) }];
    }
}

/** Create the node {@link Agent}; `send(text)` runs the whole add/delete turn. */
export const createNodeAgent = (deps: NodeAgentDeps): Agent => new NodeAgent(deps);
