import { createBuilderAgent } from './builderAgent';
import { createEdgeAgent } from './edgeAgent';
import { createGeneratorAgent } from './generatorAgent';
import { createLocatorAgent } from './locatorAgent';
import { createAgentRoster } from './roster';

import type { AgentRegistration, AgentRoster } from './roster';

/**
 * The explicit roster: the two cross-block OPERATION agents (locator, edge), the named BLOCK specialists
 * (the AI generator), and the composition BUILDER (builds a whole multi-block flow from a plan). Every OTHER
 * block type is handled by a generic `BlockAgent`, synthesized on demand by the sub-agent runner from the
 * catalog — so it is NOT listed here (and needs no prompt edit).
 *
 * NOTE: the old operation-split `node` + `property` agents are intentionally NOT registered — the orchestrator
 * can no longer spawn them. Their modules stay in the tree (deleted in a later cleanup); block agents own
 * add/configure/rename/delete now.
 */
export const DEFAULT_REGISTRATIONS: AgentRegistration[] = [
    {
        type: 'locator',
        summary: 'moves an existing node to a new position',
        create: deps => createLocatorAgent(deps),
    },
    {
        type: 'edge',
        summary: 'connects two nodes or disconnects an edge',
        create: deps => createEdgeAgent(deps),
    },
    {
        type: 'single-output-generator',
        summary:
            'AI text generator: create, configure, rename, or delete a generator node (knows models, provider keys, temperature/topK/topP)',
        create: deps => createGeneratorAgent(deps),
    },
    {
        type: 'builder',
        summary:
            'the flow builder — shapes the graph itself. It adds nodes and, above all, owns the EDGES between them: ' +
            'connect, rewire, reroute, or disconnect, on nodes brand-new or already on the canvas. Send it anything ' +
            'about wiring or dataflow — "connect A to B", "make the preview read from the buffer instead of the ' +
            'generator", "insert a node between two others", "build a text → generator → preview pipeline" — together ' +
            'with the configuring, renaming, moving, and layout a build needs. One reconnection or a whole pipeline: ' +
            'if the shape or wiring of the flow changes, this is the agent',
        create: deps => createBuilderAgent(deps),
    },
];

/** The default roster: operation agents + named block specialists (generic block agents resolve on demand). */
export const createDefaultRoster = (): AgentRoster => createAgentRoster(DEFAULT_REGISTRATIONS);
