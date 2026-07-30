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
 * A block's whole node lifecycle, scoped to ONE block type: find it (type-scoped `search_nodes` + `describe_node`),
 * add/delete it (structure), configure/rename it (config). This is the single cohesive capability a block agent
 * is built from — several tools bundled into one job, parameterized by the block type the agent owns.
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
