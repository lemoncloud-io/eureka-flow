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
 * There are no cross-block OPERATION agents (no separate wire/move/rename specialist): the builder owns wiring,
 * layout, and labeling; block agents own config. Both assemble their edit tools by listing tool VALUES via
 * `toolset` (see `tools/toolset.ts`), so an operation is a tool the right agent carries, not an agent.
 */
export const DEFAULT_REGISTRATIONS: AgentRegistration[] = [
    {
        type: 'single-output-generator',
        summary:
            'AI text generator content: configure a generator node (knows models, provider keys, temperature/topK/topP)',
        create: deps => createSingleOutputGeneratorAgent(deps),
    },
    {
        type: 'builder',
        summary:
            'Builds and reshapes the flow graph: adds or deletes nodes, wires/rewires/reroutes/disconnects edges, ' +
            'moves, lays out, and labels them (new or existing). Give it the whole structural plan — one ' +
            'reconnection or a full pipeline; route here whenever the flow’s shape, wiring, layout, or labels change.',
        create: deps => createBuilderAgent(deps),
    },
];

/** The default roster: the builder (structure) + named content specialists (generic block agents resolve on demand). */
export const createDefaultRoster = (): AgentRoster => createAgentRoster(DEFAULT_REGISTRATIONS);

/**
 * Agent types that run on the ORCHESTRATOR's (reasoning) model by inheritance — the reasoning tier.
 * The builder is the hard structural-composition turn and is always paired with the orchestrator
 * (design §5), so it is exempt from the worker `AGENT_MODEL_DEFAULT` fallback: with no explicit
 * model it resolves to `undefined` and inherits the orchestrator's gateway. An explicit
 * `AGENT_MODEL_BUILDER` still overrides. See {@link agentModelResolver}'s `inheritTypes`.
 */
export const ORCHESTRATOR_MODEL_TIER = ['builder'];
