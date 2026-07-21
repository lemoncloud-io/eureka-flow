import { BaseAgent } from './baseAgent';
import { createCanvasToolProvider, listNodeLocations } from '../canvas/canvasTools';
import { DEFAULT_STEP } from '../canvas/moveSemantics';

import type { BaseAgentDeps } from './baseAgent';
import type { Agent, AgentConfig } from '../agent';
import type { CanvasBinding } from '../canvas/canvasBinding';
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
    `- If the user gives no distance (e.g. "nudge it right", "move it up a bit"), use a default of ${DEFAULT_STEP}px and say so.`,
    '- Match the node the user means by its label or type against the provided node list (case-insensitive).',
    '  If NO node matches, do not move anything — say you could not find it (you may list the nodes you can see).',
    '  If MORE THAN ONE node matches, do not guess — ask which one, listing the candidates.',
    '- Move exactly one node per `move_node` call; for several nodes, make several calls.',
    '- After moving, confirm briefly what you moved and its new position.',
].join('\n');

export interface LocatorAgentDeps extends BaseAgentDeps {
    binding: CanvasBinding;
    /** Override the agent config (id/description/systemPrompt/grant). Tools are always the locator provider. */
    config?: Partial<Omit<AgentConfig, 'tools'>>;
}

const renderNodeContext = (binding: CanvasBinding): string => {
    const nodes = listNodeLocations(binding);
    if (nodes.length === 0) {
        return 'Current canvas: (no nodes).';
    }
    const lines = nodes.map(
        n =>
            `- id="${n.id}" type="${n.type}"${n.label ? ` label="${n.label}"` : ''} at (${n.position.x}, ${n.position.y})`
    );
    return `Current nodes on the canvas:\n${lines.join('\n')}`;
};

const buildLocatorConfig = (deps: LocatorAgentDeps): AgentConfig => ({
    id: deps.config?.id ?? 'locator',
    description: deps.config?.description ?? 'Moves existing nodes on the canvas.',
    systemPrompt: deps.config?.systemPrompt ?? LOCATOR_SYSTEM_PROMPT,
    grant: deps.config?.grant ?? { canModifyCanvas: true },
    tools: [createCanvasToolProvider(deps.binding)],
});

/**
 * The first concrete agent. It adds just two things to {@link BaseAgent}: the canvas tool
 * provider + persona (through its {@link AgentConfig}), and per-turn seeding of the live node
 * list so the model can resolve the node the user means and read its current position.
 *
 * The whole think/act turn — applying each `move_node` straight to the live canvas via the
 * {@link CanvasBinding}, ending on the model's confirmation — is inherited from `BaseAgent`.
 * There is no draft and no approval gate.
 */
export class LocatorAgent extends BaseAgent {
    private readonly binding: CanvasBinding;

    constructor(deps: LocatorAgentDeps) {
        super(deps, buildLocatorConfig(deps));
        this.binding = deps.binding;
    }

    /** Seed the model with the current node list before every model call. */
    protected override buildContextMessages(): ChatMessage[] {
        return [{ role: 'system', content: renderNodeContext(this.binding) }];
    }
}

/**
 * Create the locator {@link Agent}. Thin factory over `new LocatorAgent(deps)`, kept so existing
 * call sites (the React hook, the tests) read the same. `send(text)` runs the whole think/act turn.
 */
export const createLocatorAgent = (deps: LocatorAgentDeps): Agent => new LocatorAgent(deps);
