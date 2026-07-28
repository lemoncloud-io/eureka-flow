import type { HttpPort, HttpRequest } from '../ports/http';
import type { EdgeData, NodeData } from '@lemoncloud/eureka-flows-api';

export interface StubHttpPort extends HttpPort {
    /** Every request the engine made, in order — the demo prints these as its receipt. */
    calls: HttpRequest[];
    /** The body of the last save, so a caller can check what would have hit the server. */
    lastSaveBody: () => { nodes: NodeData[]; edges: EdgeData[] } | null;
}

export interface StubHttpPortOptions {
    /**
     * Called when a node is asked to run. A real server answers the request and then
     * streams the run over the socket; this is where the demo does the streaming half.
     */
    onRun?: (nodeId: string, req: HttpRequest) => void;
}

/**
 * Blocks as `GET /blocks/0/list?cores=1` actually answers.
 *
 * The row is the block record — its own `id`, `stereo`, `isFrontend` as a 0/1 flag — and
 * `$definition` is the definition a node names by `type`. This used to be a flat list with
 * `type` at the top level, which is a shape the server has never sent: the stub had been
 * written to match the client rather than the server, so the registry silently keyed every
 * block under `undefined` and the demo still reported OK.
 */
const BLOCKS = [
    {
        id: '0001',
        stereo: 'input',
        isFrontend: 1,
        $definition: {
            type: 'input-text',
            label: 'Text Input',
            inputs: [],
            outputs: [{ id: 'out', type: 'text' }],
        },
    },
    {
        id: '0002',
        stereo: 'process',
        isFrontend: 0,
        $definition: {
            type: 'process-llm',
            label: 'LLM',
            inputs: [{ id: 'in', type: 'text' }],
            outputs: [{ id: 'out', type: 'text' }],
        },
    },
    {
        id: '0003',
        stereo: 'output',
        isFrontend: 0,
        $definition: {
            type: 'output-text',
            label: 'Text Output',
            inputs: [{ id: 'in', type: 'text' }],
            outputs: [],
        },
    },
];

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
export const createStubHttpPort = ({ onRun }: StubHttpPortOptions = {}): StubHttpPort => {
    const calls: HttpRequest[] = [];
    let saved: { nodes: NodeData[]; edges: EdgeData[] } | null = null;

    return {
        calls,
        lastSaveBody: () => saved,
        request: async <T>(req: HttpRequest) => {
            calls.push(req);

            // The server wraps its lists; so does the stub, or the wrapper goes untested.
            if (req.path === '/blocks/0/list') return { status: 200, data: { list: BLOCKS } as T };
            if (req.path.endsWith('/load')) return { status: 200, data: structuredClone(FLOW) as T };
            if (req.path.endsWith('/save')) {
                saved = req.body as { nodes: NodeData[]; edges: EdgeData[] };
                return { status: 200, data: { id: FLOW.id } as T };
            }
            if (req.path.endsWith('/run')) {
                const nodeId = decodeURIComponent(req.path.slice('/nodes/'.length, -'/run'.length));
                onRun?.(nodeId, req);
                return { status: 200, data: { id: nodeId, state: 'RUNNING' } as T };
            }
            throw new Error(`stub has no answer for ${req.method} ${req.path}`);
        },
    };
};
