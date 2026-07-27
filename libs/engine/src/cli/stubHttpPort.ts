import type { HttpPort, HttpRequest } from '../ports/http';
import type { BlockDefinitionWithFrontend } from '../types';
import type { EdgeData, NodeData } from '@lemoncloud/eureka-flows-api';

export interface StubHttpPort extends HttpPort {
    /** Every request the engine made, in order — the demo prints these as its receipt. */
    calls: HttpRequest[];
    /** The body of the last save, so a caller can check what would have hit the server. */
    lastSaveBody: () => { nodes: NodeData[]; edges: EdgeData[] } | null;
}

const BLOCKS = [
    { type: 'input-text', name: 'Text Input', stereo: 'input', inputs: [], outputs: [{ id: 'out', type: 'text' }] },
    {
        type: 'process-llm',
        name: 'LLM',
        stereo: 'process',
        inputs: [{ id: 'in', type: 'text' }],
        outputs: [{ id: 'out', type: 'text' }],
    },
    {
        type: 'output-text',
        name: 'Text Output',
        stereo: 'output',
        inputs: [{ id: 'in', type: 'text' }],
        outputs: [],
    },
] as unknown as BlockDefinitionWithFrontend[];

const FLOW = {
    id: 'demo-flow',
    isEditable: true,
    hasOwned: true,
    nodes: [
        { id: 'n1', type: 'input-text', position: { x: 0, y: 0 }, config: { value: 'hello' } },
        { id: 'n2', type: 'process-llm', position: { x: 300, y: 0 }, config: {} },
    ] as unknown as NodeData[],
    edges: [
        { id: 'e1', sourceNodeId: 'n1', sourcePortId: 'out', targetNodeId: 'n2', targetPortId: 'in' },
    ] as unknown as EdgeData[],
};

/**
 * A server that does not exist.
 *
 * The demo's claim is that the engine runs with no browser, not that the network works,
 * so the default run needs no key and no connectivity — and gives the same output every
 * time, which makes it a test as well as a demo.
 */
export const createStubHttpPort = (): StubHttpPort => {
    const calls: HttpRequest[] = [];
    let saved: { nodes: NodeData[]; edges: EdgeData[] } | null = null;

    return {
        calls,
        lastSaveBody: () => saved,
        request: async <T>(req: HttpRequest) => {
            calls.push(req);

            if (req.path === '/blocks/0/list') return { status: 200, data: BLOCKS as T };
            if (req.path.endsWith('/load')) return { status: 200, data: structuredClone(FLOW) as T };
            if (req.path.endsWith('/save')) {
                saved = req.body as { nodes: NodeData[]; edges: EdgeData[] };
                return { status: 200, data: { id: FLOW.id } as T };
            }
            throw new Error(`stub has no answer for ${req.method} ${req.path}`);
        },
    };
};
