import { createApiKeyAuth, createFetchHttpPort, createFlowWorkspace } from '@flows/engine';

import { createBlockCatalogLookup } from '../blockCatalog';
import { createEngineCanvasBinding } from '../canvas';
import { createStubBackend } from './stubBackend';

import type { CanvasBinding } from '../canvas';
import type { CatalogLookup } from '../catalog';
import type { FlowEngine, FlowRepository, HttpPort } from '@flows/engine';

export interface StackConfig {
    /** Connected → hit the real backend; offline → the stub port ({@link createStubBackend}). */
    connected: boolean;
    /** Backend root, e.g. `https://api.eureka.codes/flw-d1` — required when `connected`. */
    baseUrl?: string;
    /** API key sent as `x-api-key`; `null` = the public endpoint. Ignored offline. */
    apiKey?: string | null;
    /** Load this flow into the engine; omit to start with an empty canvas (blocks only). */
    flowId?: string;
    /** Optional decorator around the built {@link HttpPort} (e.g. the wire log); identity if omitted. */
    wrapHttp?: (port: HttpPort) => HttpPort;
}

/** The real flow stack the terminal drives — identical to what the browser's `FlowAgentPanel` assembles. */
export interface Stack {
    engine: FlowEngine;
    binding: CanvasBinding;
    catalog: CatalogLookup;
    /** For `/save` (write the graph back) and flow metadata; present in both modes (offline saves to nowhere). */
    repository: FlowRepository;
}

/**
 * Build the real engine stack via `createFlowWorkspace` (engine + repository over an {@link HttpPort}), then
 * the same `createEngineCanvasBinding` + `createBlockCatalogLookup` the browser wires. The only difference
 * from the browser is the injected port — a live fetch port vs the offline stub — and, upstream, the gateway.
 *
 * With `flowId`, loads that flow's blocks + graph; without, loads blocks only and leaves the canvas empty.
 */
export const assembleStack = async (config: StackConfig): Promise<Stack> => {
    let http: HttpPort;
    if (config.connected) {
        if (!config.baseUrl) throw new Error('connected mode needs a baseUrl (FLOW_API_URL)');
        http = createFetchHttpPort({ baseUrl: config.baseUrl, auth: createApiKeyAuth(config.apiKey ?? null) });
    } else {
        http = createStubBackend();
    }
    if (config.wrapHttp) http = config.wrapHttp(http);

    const { engine, repository } = createFlowWorkspace({ http });
    // `load` fetches blocks + the flow; without a flow we only need the block registry (engine stays empty).
    if (config.flowId) await repository.load(config.flowId);
    else await repository.loadBlocks();

    return {
        engine,
        binding: createEngineCanvasBinding(engine),
        catalog: createBlockCatalogLookup(repository.blockRegistry()),
        repository,
    };
};
