import { createEdgeToolProvider } from '../tools/edgeTools';
import {
    createNodeConfigToolProvider,
    createNodeMoveToolProvider,
    createNodeReadToolProvider,
    createNodeSearchToolProvider,
    createNodeStructureToolProvider,
} from '../tools/nodeTools';

import type { Skill } from './skill';

/**
 * The skill set — each a cohesive capability that wraps the shipped tool provider(s) verbatim (no new tool
 * code). Agents compose these; grants stay on the agent (a skill is just the capability, not who may use it).
 */

/** Inspect the canvas: list + describe any node (full, cross-type read). */
export const inspectSkill: Skill = {
    name: 'inspect',
    description: 'List and describe any node on the canvas.',
    createTools: ({ binding, catalog }) => [createNodeReadToolProvider(binding, catalog)],
};

/** Reposition a node. */
export const moveSkill: Skill = {
    name: 'move',
    description: 'Move a node to a new position.',
    createTools: ({ binding }) => [createNodeMoveToolProvider(binding)],
};

/** Wire the graph: connect two nodes or disconnect an edge (validation lives in the tool). */
export const edgeSkill: Skill = {
    name: 'edge',
    description: 'Connect two nodes or disconnect an edge.',
    createTools: ({ binding, catalog }) => [createEdgeToolProvider(binding, catalog)],
};

/**
 * A block's whole node lifecycle for ONE block type: find its nodes (`search_nodes`, type-scoped so the agent
 * only ever LISTS its own type) and inspect one (`describe_node`, by id), add/delete it (structure), and
 * configure/rename it (config). The type scope is a DISCOVERY boundary — it narrows what the agent can find and
 * see; the by-id tools act on whatever concrete node the orchestrator briefed. One cohesive capability,
 * parameterized by the block type the agent owns.
 */
export const lifecycleSkill = (blockType: string): Skill => ({
    name: `lifecycle:${blockType}`,
    description: `Add, configure, rename, and delete ${blockType} nodes.`,
    createTools: ({ binding, catalog }) => [
        createNodeSearchToolProvider(binding, catalog, { type: blockType }),
        createNodeStructureToolProvider(binding, catalog),
        createNodeConfigToolProvider(binding, catalog),
    ],
});
