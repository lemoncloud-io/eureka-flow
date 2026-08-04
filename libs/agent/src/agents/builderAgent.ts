import { BaseAgent } from './baseAgent';
import { SEED_SKILLS, createUseSkillToolProvider } from '../skills';
import { createCatalogToolProvider } from '../tools/catalogTools';
import { createEdgeToolProvider } from '../tools/edgeTools';
import {
    createNodeConfigToolProvider,
    createNodeMoveToolProvider,
    createNodeReadToolProvider,
    createNodeStructureToolProvider,
    renderEdgeContext,
    renderNodeContext,
} from '../tools/nodeTools';

import type { BaseAgentDeps } from './baseAgent';
import type { Agent } from '../agent';
import type { ChatMessage } from '../llm/llmGateway';

/**
 * The Builder persona: it EXECUTES a plan, it does not make one. The orchestrator plans a multi-block build and
 * spawns the Builder with a complete objective; the Builder realizes it on the live canvas (add · wire ·
 * configure · lay out) and reports. Domain specifics (the linear-pipeline shape, the generator's model map, the
 * well-formedness checklist) live in the on-demand `use_skill` playbooks — the persona carries only the
 * always-true build discipline, so it stays lean while the Builder can build many kinds of flow.
 */
export const BUILDER_SYSTEM_PROMPT = [
    'You are the Builder for the Eureka visual flow-builder. The orchestrator hands you a PLAN — a complete,',
    'self-contained objective — and you BUILD it on the live canvas: add nodes, wire them, configure them, and',
    'lay them out. You do not plan or coordinate and you cannot talk to the user; you carry out the plan you were',
    'given and report what you did.',
    '',
    'Before building, consider your skills: load the skill whose description matches the kind of work in front',
    'of you (building a pipeline, configuring a generator, …), then follow its instructions. Load one only when',
    'it fits; a simple build may need none.',
    '',
    'You hold the WHOLE job in a single growing context, so two habits keep you fast and correct:',
    '- Judge your progress by READING the canvas, not from memory and not by re-doing an action to confirm it',
    '  took: the node and edge lists you are shown each turn are exactly what is there now. Check them against',
    '  the plan — a node or edge already listed is done, so leave it (re-adding it is wasted work); one the plan',
    '  needs that you do NOT see listed is still missing, so make it. You are finished only once the lists show',
    '  every node and connection the plan calls for; then make no more tool calls and write your summary.',
    '- Look each thing up ONCE and reuse it. A node’s ports are fixed by its block TYPE — the same for every node',
    '  of that type, whether you just added it or it was already on the canvas — so a single catalog_search per',
    '  type tells you how to wire all of them; you never inspect an individual node to learn its ports. Reach for',
    '  describe_node only to read a node’s current config before you change it, and never re-list or re-describe',
    '  something an earlier call already told you.',
    '',
    'How to build:',
    '- Look before you build: read what is already on the canvas — its nodes and how they are wired — and look',
    '  up the block types you need. Reuse an existing node rather than duplicating one.',
    '- Build in dependency order — create a stage before the stage that consumes it — and thread each new node’s',
    '  returned id into the wiring and configuration that follow. Give a new node its non-default config as you',
    '  create it rather than adding then reconfiguring.',
    '- Wire each stage to the one(s) that consume it: a source OUTPUT to the intended target INPUT. An output may',
    '  feed several inputs, but each input holds ONE edge — never leave a required input dangling, and never',
    '  create a cycle.',
    '- To insert or reroute onto an input that is already taken, free it FIRST — disconnect the old edge, then',
    '  connect the new one: remove before reuse. Do it without asking; don’t connect blindly and then patch up the',
    '  rejection afterwards.',
    '- Lay the flow out so it reads in order: place each node to the right of the one that feeds it, evenly spaced,',
    '  not overlapping.',
    '- Configure against the real schema: map the user’s wording onto the block’s actual fields and allowed',
    '  values. Stop only for a genuinely impossible task — a value the schema forbids, a field that does not',
    '  exist, or a connection that would create a cycle — which you report and leave, never forcing or faking it.',
    '',
    'You cannot ask the user anything and cannot see the conversation; your briefing is complete. Do everything',
    'the plan needs, then finish with a short summary of what you built and anything you could not.',
].join('\n');

/** The Builder carries only the shared per-turn deps; its tools + seed playbooks are fixed. */
export type BuilderAgentDeps = BaseAgentDeps;

/**
 * The Builder's think/act budget. A narrow specialist makes ONE edit, so the {@link DEFAULT_MAX_ITERATIONS}
 * of 8 is plenty; the Builder instead realizes a WHOLE flow in a single turn — add several nodes, wire every
 * edge, configure, lay out, THEN summarize. The cap must exceed the largest legit build's tool-call count AND
 * leave a turn for that closing summary: the loop only reports success on a final TEXT-ONLY turn (no tool call,
 * see {@link BaseAgent.send} + subAgentRunner's `lastAssistantText`). A cap that just equals the work count
 * leaves no room to conclude, so the turn ends in `phase:error` and the orchestrator mis-reports it as a failure
 * even though every edit landed — observed on a 5-node branch build that used all 20 calls and never summarized.
 * 30 gives clear headroom; the builder's completion discipline (stop the moment the canvas matches the plan),
 * not this cap, is what bounds a healthy run. Hardcoded for now; `deps.maxIterations` still overrides it.
 */
export const BUILDER_MAX_ITERATIONS = 30;

/**
 * The composition specialist: the FULL editing toolset (read · catalog · structure · config · edge · move) plus
 * `use_skill` over {@link SEED_SKILLS}, all wired directly over the live `binding`. Grant is the union the
 * writes need (`canModifyCanvas` + `canEditConfig`), gated at the executor against the user's flow-role too. A
 * leaf sub-turn: it carries no `spawn`, so it never nests.
 */
export class BuilderAgent extends BaseAgent {
    constructor(deps: BuilderAgentDeps) {
        // The Builder builds a whole flow per turn, so it defaults to a larger iteration cap than a narrow
        // specialist; an explicit deps.maxIterations still wins (future config seam).
        super(
            { ...deps, maxIterations: deps.maxIterations ?? BUILDER_MAX_ITERATIONS },
            {
                id: 'builder',
                description:
                    'Shapes the flow graph: adds nodes and connects, rewires, reroutes, or disconnects the edges between them — new or existing, a single reconnection or a whole pipeline — plus the configuring, renaming, moving, and layout that goes with it.',
                systemPrompt: BUILDER_SYSTEM_PROMPT,
                grant: { canModifyCanvas: true, canEditConfig: true },
                tools: [
                    createNodeReadToolProvider(deps.binding, deps.catalog), // list_nodes, describe_node
                    createCatalogToolProvider(deps.catalog), // catalog_search (full schema per hit)
                    createNodeStructureToolProvider(deps.binding, deps.catalog), // add_node, delete_node
                    createNodeConfigToolProvider(deps.binding, deps.catalog), // set_properties, rename
                    createEdgeToolProvider(deps.binding, deps.catalog), // list_edges, connect_nodes, disconnect_edge
                    createNodeMoveToolProvider(deps.binding), // move_node
                    createUseSkillToolProvider(SEED_SKILLS), // use_skill (progressive-disclosure playbooks)
                ],
            }
        );
    }

    /**
     * Seed the current canvas — its nodes AND their wiring — before every model call; the catalog + playbook
     * bodies are pulled on demand. The edge list is what makes an already-occupied input visible, so the builder
     * frees it before reusing it (the persona's remove-before-reuse rule) instead of connecting blindly and
     * recovering from the rejection. Occupancy is a fact of the edge set, never of a node, so it can only be seen
     * here.
     */
    protected override buildContextMessages(): ChatMessage[] {
        return [
            {
                role: 'system',
                content: `${renderNodeContext(this.binding)}\n\n${renderEdgeContext(this.binding)}`,
            },
        ];
    }
}

/** Create the builder {@link Agent}; `send(plan)` runs the whole build turn against the live canvas. */
export const createBuilderAgent = (deps: BuilderAgentDeps): Agent => new BuilderAgent(deps);
