import type { HttpPort, HttpRequest } from '@flows/engine';

/**
 * The offline backend (`--offline` / `--fake`): an engine {@link HttpPort} with no server behind it, answering
 * the three requests the repository makes (`GET /blocks/0/list`, `GET /flows/:id/load`, `POST /flows/:id/save`)
 * with a baked block set and an empty flow. The real engine + binding + catalog still run — only the block
 * registry is a stand-in, so canvas behaviour (default config, port checks, cascade) is unchanged. Rows use
 * the SERVER shape (`$definition` + `stereo` + `isFrontend`) so the real `FlowRepository` normalization runs.
 * The set is an input→process→output vertical (with a select + numeric field) — something realistic to build.
 */
const BLOCK_ROWS = [
    {
        id: '0001',
        stereo: 'input',
        isFrontend: 1,
        $definition: {
            type: 'input-text',
            label: 'Text Input',
            description: 'A static text source.',
            inputs: [],
            outputs: [{ id: 'out', type: 'text' }],
            configSchema: [{ key: 'text', type: 'string', label: 'Text' }],
        },
    },
    {
        id: '0002',
        stereo: 'process',
        isFrontend: 1,
        $definition: {
            type: 'buffer',
            label: 'Buffer',
            description: 'Passes its input through after a delay.',
            inputs: [{ id: 'in', type: 'text' }],
            outputs: [{ id: 'out', type: 'text' }],
            configSchema: [{ key: 'delayMs', type: 'number', label: 'Delay (ms)' }],
        },
    },
    {
        id: '0003',
        stereo: 'process',
        isFrontend: 0,
        $definition: {
            type: 'single-output-generator',
            label: 'Generator',
            description: 'An LLM step with a normal and an error output.',
            inputs: [{ id: 'in', type: 'text' }],
            outputs: [
                { id: 'out', type: 'text' },
                { id: 'err', type: 'text' },
            ],
            configSchema: [
                {
                    key: 'model',
                    type: 'select',
                    label: 'Model',
                    options: [{ value: 'gemini-2.5-flash' }, { value: 'gemini-2.5-pro' }],
                },
                { key: 'temperature', type: 'number', label: 'Temperature' },
            ],
        },
    },
    {
        id: '0004',
        stereo: 'output',
        isFrontend: 1,
        $definition: {
            type: 'output-preview',
            label: 'Preview',
            description: 'Renders whatever reaches it.',
            inputs: [{ id: 'in', type: 'text' }],
            outputs: [],
        },
    },
];

/** An empty flow — the offline canvas starts blank; `--seed`/`/seed` loads a graph through the engine instead. */
const EMPTY_FLOW = { id: 'offline', isEditable: true, hasOwned: true, nodes: [], edges: [] };

/** An engine {@link HttpPort} with no server behind it — the offline block registry (see the module doc). */
export const createStubBackend = (): HttpPort => ({
    request: async <T>(req: HttpRequest) => {
        if (req.path === '/blocks/0/list') return { status: 200, data: { list: BLOCK_ROWS } as T };
        if (req.path.endsWith('/load')) return { status: 200, data: structuredClone(EMPTY_FLOW) as T };
        if (req.path.endsWith('/save')) return { status: 200, data: { id: EMPTY_FLOW.id } as T };
        throw new Error(`offline stub backend has no answer for ${req.method} ${req.path}`);
    },
});
