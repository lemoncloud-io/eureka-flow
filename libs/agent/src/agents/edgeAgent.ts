import { BaseAgent } from './baseAgent';
import { createEdgeToolProvider } from '../tools/edgeTools';
import { createNodeReadToolProvider, renderNodeContext } from '../tools/nodeTools';

import type { BaseAgentDeps } from './baseAgent';
import type { Agent } from '../agent';
import type { ChatMessage } from '../llm/llmGateway';

/** The `edge` specialist persona: connect or disconnect edges only. Read-before-connect; a rejected connection is reported, not rerouted. */
export const EDGE_SYSTEM_PROMPT = [
    'You are the Edge agent for a visual flow-builder. Your ONLY job is to connect two nodes or disconnect an',
    'edge. You never add, delete, move, or configure nodes — if asked for any of those, briefly say wiring is',
    'all you do.',
    '',
    'How to work:',
    '- Connect exactly what the task asks: a source output to the intended target input. Check the blocks’ real',
    '  ports before wiring, and connect to the specific input meant — each input holds a single edge.',
    '- A connection can be rejected: an unknown node or port, incompatible port types, a link that would create',
    '  a cycle, or a target input that is already occupied. When it is, do NOT reroute to another port, force the',
    '  link, or overwrite an existing edge — report the reason (for an occupied input, the occupying edge that',
    '  was named; otherwise the ports the block exposes). Whoever briefed you decides the fix — typically',
    '  disconnect the occupying edge first, then reconnect.',
    '- You cannot ask the user anything and cannot see the conversation; your briefing is complete.',
    '- Finish with a short summary of what you connected or disconnected and anything you could not.',
].join('\n');

/** The `edge` specialist carries only the shared {@link BaseAgentDeps}; its tools are fixed. */
export type EdgeAgentDeps = BaseAgentDeps;

/** The connect/disconnect specialist: read + edge providers over the live `binding`; grant `canModifyCanvas`. */
export class EdgeAgent extends BaseAgent {
    constructor(deps: EdgeAgentDeps) {
        super(deps, {
            id: 'edge',
            description: 'Connects two nodes or disconnects an edge.',
            systemPrompt: EDGE_SYSTEM_PROMPT,
            grant: { canModifyCanvas: true },
            tools: [
                createNodeReadToolProvider(deps.binding, deps.catalog),
                createEdgeToolProvider(deps.binding, deps.catalog),
            ],
        });
    }

    /** Seed the model with the current node list (over the live canvas) before every model call. */
    protected override buildContextMessages(): ChatMessage[] {
        return [{ role: 'system', content: renderNodeContext(this.binding) }];
    }
}

/** Create the edge {@link Agent}; `send(text)` runs the whole connect/disconnect turn. */
export const createEdgeAgent = (deps: EdgeAgentDeps): Agent => new EdgeAgent(deps);
