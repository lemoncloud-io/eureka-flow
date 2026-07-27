import { createFlowEngine } from '../engine';
import { createFlowRepository } from './flowRepository';

import type { FlowEngine } from '../engine';
import type { FlowRepository } from './flowRepository';
import type { HttpPort } from '../ports/http';

export interface FlowWorkspace {
    engine: FlowEngine;
    repository: FlowRepository;
}

/**
 * Engine and repository, tied together.
 *
 * They need each other: the repository drives the engine, and the engine asks the
 * repository for the block registry so `connect` can check port types. Composing them
 * here means no caller has to know that, and no caller can get the order wrong.
 */
export const createFlowWorkspace = ({ http }: { http: HttpPort }): FlowWorkspace => {
    // The knot: the engine wants the registry the repository fetches, and the repository
    // wants the engine to load into. Held indirectly so the engine can be built first and
    // still read a registry that arrives later.
    const holder: { repository?: FlowRepository } = {};
    const engine = createFlowEngine({ getBlockRegistry: () => holder.repository?.blockRegistry() ?? {} });
    const repository = createFlowRepository({ engine, http });
    holder.repository = repository;

    return { engine, repository };
};
