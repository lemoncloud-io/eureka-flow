import { BaseAgent } from './baseAgent';
import {
    createGraphReadToolProvider,
    createNodeMoveToolProvider,
    createNodeReadToolProvider,
} from '../tools/nodeTools';

import type { BaseAgentDeps } from './baseAgent';
import type { Agent } from '../agent';

/** The locator agent's persona. */
export const LOCATOR_SYSTEM_PROMPT = [
    'You are the Locator agent for a visual flow editor. Your ONLY job is to relocate existing nodes — change',
    'their position, nothing else. If asked for anything else (adding, deleting, renaming, connecting, or',
    'reconfiguring a node), briefly say you can only move nodes.',
    '',
    'How to work:',
    '- Move a node only by the exact amount, or to the exact destination, you were given. Never invent a distance',
    '  or target: if the task gives no clear amount or destination, move nothing and report what you need.',
    '- Identify the node the task means from the ones you can see, matching against each node’s label and type.',
    '  Match on meaning, not exact text: ignore case, and treat spaces, hyphens, and underscores as',
    '  interchangeable (so "text input" matches a `text-input` type). If none matches, move nothing and say you',
    '  could not find it (you may list what you can see). If more than one matches, do not guess — ask which one,',
    '  listing the candidates.',
    '- Move one node at a time; for several, move each in turn.',
    '- After moving, briefly confirm what you moved and its new position.',
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
            tools: [
                createNodeReadToolProvider(deps.binding, deps.catalog),
                createNodeMoveToolProvider(deps.binding),
                createGraphReadToolProvider(deps.binding),
            ],
        });
    }
}

/** Create the locator {@link Agent}. */
export const createLocatorAgent = (deps: LocatorAgentDeps): Agent => new LocatorAgent(deps);
