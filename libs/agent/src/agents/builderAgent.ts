import { BaseAgent } from './baseAgent';
import { SEED_SKILLS, createUseSkillToolProvider } from '../skills';
import { createCatalogToolProvider } from '../tools/catalogTools';
import { createEdgeToolProvider } from '../tools/edgeTools';
import {
    createNodeConfigToolProvider,
    createNodeMoveToolProvider,
    createNodeReadToolProvider,
    createNodeStructureToolProvider,
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
    'of you (building a pipeline, configuring a generator, validating a flow, …), then follow its instructions.',
    'Load one only when it fits; a simple build may need none.',
    '',
    'How to work:',
    '- Look before you build: read what is already on the canvas, and look up the block types you need — their',
    '  real fields and ports — in the catalog. Reuse an existing node rather than duplicating it.',
    '- Build in dependency order — create a stage before the stage that consumes it — and thread each new node’s',
    '  returned id into the wiring and configuration that follow. Give a new node its non-default config as you',
    '  create it rather than adding then reconfiguring.',
    '- Wire each stage to the one(s) that consume it: a source OUTPUT to the intended target INPUT. An output may',
    '  feed several inputs, but each input holds ONE edge — never leave a required input dangling, and never',
    '  create a cycle.',
    '- Lay the flow out so it reads in order: place each node to the right of the one that feeds it, evenly spaced,',
    '  not overlapping.',
    '- Configure against the real schema: map the user’s wording onto the block’s actual fields and allowed',
    '  values. If a value is not allowed, a field does not exist, or a connection is rejected — including a',
    '  target input that already holds an edge — do NOT force it or work around it by undoing wiring your',
    '  briefing did not ask you to change; report what was rejected and let whoever briefed you decide. Only',
    '  disconnect or replace an existing edge when your briefing explicitly calls for it (a reroute or replacement).',
    '- Before finishing, read the graph back and repair what the plan lets you: a dangling required input, an',
    '  invalid config.',
    '',
    'You cannot ask the user anything and cannot see the conversation; your briefing is complete. Do everything',
    'you can, then finish with a short summary of what you built and anything you could not.',
].join('\n');

/** The Builder carries only the shared per-turn deps; its tools + seed playbooks are fixed. */
export type BuilderAgentDeps = BaseAgentDeps;

/**
 * The Builder's think/act budget. A narrow specialist makes ONE edit, so the {@link DEFAULT_MAX_ITERATIONS}
 * of 8 is plenty; the Builder instead realizes a WHOLE flow in a single turn — add several nodes, wire every
 * edge, configure, lay out, then summarize — which easily exceeds 8 (observed: it added three nodes then hit
 * the cap before wiring any edge). So it runs with a larger cap. Hardcoded for now; a caller may still override
 * it by passing `deps.maxIterations`, and a future config can drive it.
 */
export const BUILDER_MAX_ITERATIONS = 20;

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
                    createCatalogToolProvider(deps.catalog), // catalog_search, describe_block
                    createNodeStructureToolProvider(deps.binding, deps.catalog), // add_node, delete_node
                    createNodeConfigToolProvider(deps.binding, deps.catalog), // set_properties, rename
                    createEdgeToolProvider(deps.binding, deps.catalog), // list_edges, connect_nodes, disconnect_edge
                    createNodeMoveToolProvider(deps.binding), // move_node
                    createUseSkillToolProvider(SEED_SKILLS), // use_skill (progressive-disclosure playbooks)
                ],
            }
        );
    }

    /** Seed the current live node list before every model call; the catalog + playbook bodies are pulled on demand. */
    protected override buildContextMessages(): ChatMessage[] {
        return [{ role: 'system', content: renderNodeContext(this.binding) }];
    }
}

/** Create the builder {@link Agent}; `send(plan)` runs the whole build turn against the live canvas. */
export const createBuilderAgent = (deps: BuilderAgentDeps): Agent => new BuilderAgent(deps);
