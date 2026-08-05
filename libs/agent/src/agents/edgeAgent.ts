import { BaseAgent } from './baseAgent';
import { createEdgeToolProvider } from '../tools/edgeTools';
import { createGraphReadToolProvider, createNodeReadToolProvider } from '../tools/nodeTools';

import type { BaseAgentDeps } from './baseAgent';
import type { Agent } from '../agent';

/** The `edge` specialist persona: connect or disconnect edges only. Frees an occupied input to complete the connection; reports only a truly impossible link (cycle / bad port). */
export const EDGE_SYSTEM_PROMPT = [
    'You are the Edge agent for a visual flow-builder. Your ONLY job is to connect two nodes or disconnect an',
    'edge. You never add, delete, move, or configure nodes — if asked for any of those, briefly say wiring is',
    'all you do.',
    '',
    'How to work:',
    '- Connect exactly what the task asks: the source’s output to the intended target input. A node’s ports follow',
    '  from its block TYPE, so wire straight to the port the task means rather than inspecting each node to look',
    '  its ports up; reach for describe_node only when a block exposes several inputs or outputs and you must pick',
    '  which one.',
    '- Each input holds a single edge, so if the target input is already occupied, that is NOT a dead-end:',
    '  disconnect the occupying edge first, then make the requested connection — that completes the task. Do it',
    '  without asking; you do not need permission to change the canvas.',
    '- Refuse only a genuinely impossible link: an unknown node or port, incompatible port types, or one that',
    '  would create a cycle. Do NOT force it or reroute to a different port — report the reason (the ports the',
    '  block exposes, or the cycle) and finish.',
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
                createGraphReadToolProvider(deps.binding),
            ],
        });
    }
}

/** Create the edge {@link Agent}; `send(text)` runs the whole connect/disconnect turn. */
export const createEdgeAgent = (deps: EdgeAgentDeps): Agent => new EdgeAgent(deps);
