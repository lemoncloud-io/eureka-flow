import { createEdgeAgent } from './edgeAgent';
import { createLocatorAgent } from './locatorAgent';
import { createNodeAgent } from './nodeAgent';
import { createPropertyAgent } from './propertyAgent';
import { createAgentRoster } from './roster';

import type { AgentRegistration, AgentRoster } from './roster';

/** This-phase roster: the four concrete specialists. The orchestrator discovers them via `list_agents`; adding one is a single entry. */
export const DEFAULT_REGISTRATIONS: AgentRegistration[] = [
    {
        type: 'locator',
        summary: 'moves an existing node to a new position',
        create: deps => createLocatorAgent(deps),
    },
    {
        type: 'property',
        summary: "sets a node's config values and renames it",
        create: deps => createPropertyAgent(deps),
    },
    {
        type: 'node',
        summary: 'adds a node to the canvas or deletes one',
        create: deps => createNodeAgent(deps),
    },
    {
        type: 'edge',
        summary: 'connects two nodes or disconnects an edge',
        create: deps => createEdgeAgent(deps),
    },
];

/** The default this-phase roster (`locator` + `property`). */
export const createDefaultRoster = (): AgentRoster => createAgentRoster(DEFAULT_REGISTRATIONS);
