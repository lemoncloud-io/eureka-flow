import { BaseAgent } from './baseAgent';
import { inspectSkill, moveSkill, toolsFromSkills } from '../skills';
import { renderNodeContext } from '../tools/nodeTools';

import type { BaseAgentDeps } from './baseAgent';
import type { Agent } from '../agent';
import type { ChatMessage } from '../llm/llmGateway';

/** The locator agent's persona. */
export const LOCATOR_SYSTEM_PROMPT = [
    'You are the Locator agent for a visual flow editor. Your ONLY job is to relocate existing nodes on the canvas.',
    '',
    'Rules:',
    '- You can ONLY move existing nodes (change their position). You cannot add, delete, rename, connect, or reconfigure nodes.',
    '  If the user asks for anything other than moving a node, briefly say you can only move nodes.',
    '- To move a node, call `move_node` with the node id and EXACTLY ONE of `by` (relative delta) or `to` (absolute point).',
    '- Coordinates: origin is top-left; x increases to the right, y increases downward.',
    '  So right = +dx, left = -dx, up = -dy, down = +dy. Diagonals combine both axes.',
    '- The distance is given to you: use the exact `by`/`to` in your instructions. Do NOT invent one — if no clear amount or destination is given, do not move; report the exact distance or target you need.',
    '- Match the node the user means by its label or type against the provided node list (case-insensitive).',
    '  If NO node matches, do not move anything — say you could not find it (you may list the nodes you can see).',
    '  If MORE THAN ONE node matches, do not guess — ask which one, listing the candidates.',
    '- Move exactly one node per `move_node` call; for several nodes, make several calls.',
    '- After moving, confirm briefly what you moved and its new position.',
].join('\n');

/** The locator carries only the shared {@link BaseAgentDeps} (binding/catalog/config included); its tools are fixed. */
export type LocatorAgentDeps = BaseAgentDeps;

/** The move specialist: {@link BaseAgent} plus node read/move tools and per-turn node-list seeding. */
export class LocatorAgent extends BaseAgent {
    constructor(deps: LocatorAgentDeps) {
        super(deps, {
            id: 'locator',
            description: 'Moves existing nodes on the canvas.',
            systemPrompt: LOCATOR_SYSTEM_PROMPT,
            grant: { canModifyCanvas: true },
            tools: toolsFromSkills([inspectSkill, moveSkill], { binding: deps.binding, catalog: deps.catalog }),
        });
    }

    /** Seed the model with the current node list before every model call. */
    protected override buildContextMessages(): ChatMessage[] {
        return [{ role: 'system', content: renderNodeContext(this.binding) }];
    }
}

/** Create the locator {@link Agent}. */
export const createLocatorAgent = (deps: LocatorAgentDeps): Agent => new LocatorAgent(deps);
