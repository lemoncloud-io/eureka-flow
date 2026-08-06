import { createBuilderAgent } from './builderAgent';
import { createAgentRoster } from './roster';
import { createSingleOutputGeneratorAgent } from './singleOutputGeneratorAgent';

import type { AgentRegistration, AgentRoster } from './roster';

/**
 * The explicit roster for the shipped HYBRID design: the composition BUILDER (realizes a whole multi-block
 * STRUCTURE from a plan — nodes · wiring · layout) plus the named CONTENT specialist (the AI generator). Every
 * OTHER block type's content is handled by a generic `BlockAgent`, synthesized on demand by the sub-agent
 * runner from the catalog — so it is NOT listed here (and needs no prompt edit).
 *
 * NOTE: the cross-block OPERATION agents `edge` (connect/disconnect) and `locator` (move) — and the older
 * operation-split `node` + `property` agents — have been REMOVED; the builder owns wiring and layout now, and
 * block agents own config/rename. Their edit primitives live on as the tool providers the builder + block
 * agents carry (createEdgeToolProvider / createNodeMoveToolProvider / structure + config providers).
 */
export const DEFAULT_REGISTRATIONS: AgentRegistration[] = [
    {
        type: 'single-output-generator',
        summary:
            'AI text generator content: configure or rename a generator node (knows models, provider keys, temperature/topK/topP)',
        create: deps => createSingleOutputGeneratorAgent(deps),
    },
    {
        type: 'builder',
        summary:
            'the flow builder — shapes the graph itself. It adds nodes and, above all, owns the EDGES between them: ' +
            'connect, rewire, reroute, or disconnect, on nodes brand-new or already on the canvas. Send it anything ' +
            'about wiring or dataflow — "connect A to B", "make the preview read from the buffer instead of the ' +
            'generator", "insert a node between two others", "build a text → generator → preview pipeline" — together ' +
            'with the moving, layout, and the configuring a build needs. One reconnection or a whole pipeline: ' +
            'if the shape or wiring of the flow changes, this is the agent',
        create: deps => createBuilderAgent(deps),
    },
];

/** The default roster: the builder (structure) + named content specialists (generic block agents resolve on demand). */
export const createDefaultRoster = (): AgentRoster => createAgentRoster(DEFAULT_REGISTRATIONS);
