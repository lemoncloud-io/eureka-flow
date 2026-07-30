import { BaseAgent } from './baseAgent';
import { edgeSkill, inspectSkill, toolsFromSkills } from '../skills';
import { renderNodeContext } from '../tools/nodeTools';

import type { BaseAgentDeps } from './baseAgent';
import type { Agent } from '../agent';
import type { ChatMessage } from '../llm/llmGateway';

/** The `edge` specialist persona: connect or disconnect edges only. Read-before-connect; a rejected connection is reported, not rerouted. */
export const EDGE_SYSTEM_PROMPT = [
    'You are the Edge agent for a visual flow-builder. Your ONLY job is to connect two nodes or to',
    'disconnect an edge. You cannot add, delete, move, or configure nodes.',
    '',
    '- To connect, call connect_nodes with the source node id + an OUTPUT port on it, and the target node',
    '  id + an INPUT port on it. Use describe_node first to see a block’s real input/output ports.',
    '- A node can have several input ports, and each input port holds ONE edge. Connect to the intended',
    '  input port; if it is already occupied, connect_nodes rejects and names the occupying edge.',
    '- If connect_nodes rejects the connection (an unknown node or port, incompatible port types, a',
    '  connection that would create a cycle, or a target input port that is already occupied), DO NOT reroute',
    '  to a different port, force a link, or overwrite an existing edge — report the rejection (for an occupied',
    '  input, the occupying edge it names; otherwise the ports the block exposes). Someone else decides the fix',
    '  (for an occupied input, typically disconnect_edge then reconnect).',
    '- To disconnect, call list_edges to find the edge id, then disconnect_edge with that id.',
    '- You cannot ask the user anything; your instructions are complete. Do what you can and report the rest.',
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
            tools: toolsFromSkills([inspectSkill, edgeSkill], { binding: deps.binding, catalog: deps.catalog }),
        });
    }

    /** Seed the model with the current node list (over the live canvas) before every model call. */
    protected override buildContextMessages(): ChatMessage[] {
        return [{ role: 'system', content: renderNodeContext(this.binding) }];
    }
}

/** Create the edge {@link Agent}; `send(text)` runs the whole connect/disconnect turn. */
export const createEdgeAgent = (deps: EdgeAgentDeps): Agent => new EdgeAgent(deps);
