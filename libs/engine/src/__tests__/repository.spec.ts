import { describe, expect, it } from 'vitest';

import { createFlowWorkspace } from '../repository/workspace';

import type { HttpPort, HttpRequest } from '../ports/http';
import type { EdgeData, NodeData } from '@lemoncloud/eureka-flows-api';

/**
 * Blocks as the server sends them: the row carries the record, `$definition` carries what
 * a node names. A fixture shaped like the client's idea of a block instead of the server's
 * is how the registry came to be keyed on a field that is never present.
 */
const BLOCKS = [
    {
        id: '0001',
        stereo: 'input',
        isFrontend: 1,
        $definition: {
            type: 'input-text',
            inputs: [],
            outputs: [{ id: 'out', type: 'text' }],
            defaultConfig: { value: '' },
        },
    },
    {
        id: '0002',
        stereo: 'process',
        isFrontend: 0,
        $definition: {
            type: 'process-llm',
            inputs: [{ id: 'in', type: 'text' }],
            outputs: [{ id: 'out', type: 'text' }],
        },
    },
];

interface FlowFixture {
    id?: string;
    nodes: NodeData[];
    edges: EdgeData[];
    isEditable?: boolean;
    hasOwned?: boolean;
}

const flow = (over: Partial<FlowFixture> = {}): FlowFixture => ({
    id: 'f1',
    isEditable: true,
    hasOwned: true,
    nodes: [
        { id: 'n1', type: 'input-text', position: { x: 0, y: 0 }, config: { value: 'hi' } },
        { id: 'n2', type: 'process-llm', position: { x: 300, y: 0 }, config: {} },
    ] as unknown as NodeData[],
    edges: [
        { id: 'e1', sourceNodeId: 'n1', sourcePortId: 'out', targetNodeId: 'n2', targetPortId: 'in' },
    ] as unknown as EdgeData[],
    ...over,
});

interface Harness {
    http: HttpPort;
    calls: HttpRequest[];
    saves: Array<{ nodes: NodeData[]; edges: EdgeData[] }>;
}

const harness = (
    fixture: FlowFixture = flow(),
    hooks: { onSave?: () => Promise<void> | void; saveResponse?: { id?: string } } = {}
): Harness => {
    const calls: HttpRequest[] = [];
    const saves: Array<{ nodes: NodeData[]; edges: EdgeData[] }> = [];

    const http: HttpPort = {
        request: async <T>(req: HttpRequest) => {
            calls.push(req);
            if (req.path === '/blocks/0/list') return { status: 200, data: { list: BLOCKS } as T };
            if (req.path.endsWith('/load')) return { status: 200, data: structuredClone(fixture) as T };
            if (req.path.endsWith('/save')) {
                saves.push(req.body as { nodes: NodeData[]; edges: EdgeData[] });
                await hooks.onSave?.();
                return { status: 200, data: (hooks.saveResponse ?? { id: fixture.id }) as T };
            }
            if (req.path.endsWith('/run')) return { status: 200, data: { id: 'n1', state: 'RUNNING' } as T };
            throw new Error(`unexpected ${req.method} ${req.path}`);
        },
    };

    return { http, calls, saves };
};

describe('load', () => {
    it('fetches blocks before the flow, so the baseline can resolve node types', () => {
        // Invariant 7: a baseline taken while the registry is empty disagrees with the
        // working copy, and the flow reads dirty from the moment it opens.
        const { http, calls } = harness();
        const { repository } = createFlowWorkspace({ http });

        return repository.load('f1').then(() => {
            expect(calls.map(c => c.path)).toEqual(['/blocks/0/list', '/flows/f1/load']);
        });
    });

    it('leaves a freshly loaded flow clean', async () => {
        const { http } = harness();
        const { engine, repository } = createFlowWorkspace({ http });

        await repository.load('f1');

        expect(engine.getGraph().nodes).toHaveLength(2);
        expect(repository.isDirty()).toBe(false);
    });

    it('takes the legacy `connections` field when there is no `edges`', async () => {
        const legacy = { ...flow(), edges: undefined, connections: flow().edges } as unknown as FlowFixture;
        const { http } = harness(legacy);
        const { engine, repository } = createFlowWorkspace({ http });

        await repository.load('f1');

        expect(engine.getGraph().edges).toHaveLength(1);
    });

    it('clears history, so undo cannot reach the flow that was open before', async () => {
        const { http } = harness();
        const { engine, repository } = createFlowWorkspace({ http });

        await repository.load('f1');

        expect(engine.canUndo()).toBe(false);
    });
});

describe('isDirty', () => {
    it('follows edits, and comes back clean on undo', async () => {
        const { http } = harness();
        const { engine, repository } = createFlowWorkspace({ http });
        await repository.load('f1');

        engine.transact('add', ops => ops.addNode({ type: 'input-text', position: { x: 9, y: 9 } }));
        expect(repository.isDirty()).toBe(true);

        engine.undo();
        expect(repository.isDirty()).toBe(false);
    });

    it('ignores a run — runtime state is not unsaved work', async () => {
        const { http } = harness();
        const { engine, repository } = createFlowWorkspace({ http });
        await repository.load('f1');

        engine.applyRuntime('n1', {
            state: 'COMPLETED',
            outputData: { out: { value: 'x', type: 'text' } },
        } as never);

        expect(repository.isDirty()).toBe(false);
    });
});

describe('save', () => {
    it('sends the whole graph, not the change', async () => {
        // Invariant 1: save is a replace. Anything left out of the body is deleted server
        // side, so there is no partial save to optimise into.
        const { http, saves } = harness();
        const { engine, repository } = createFlowWorkspace({ http });
        await repository.load('f1');
        engine.transact('add', ops => ops.addNode({ type: 'input-text', position: { x: 9, y: 9 } }));

        await repository.save();

        expect(saves).toHaveLength(1);
        expect(saves[0].nodes).toHaveLength(3);
        expect(saves[0].edges).toHaveLength(1);
    });

    it('strips runtime state out of the body', async () => {
        const { http, saves } = harness();
        const { engine, repository } = createFlowWorkspace({ http });
        await repository.load('f1');
        engine.applyRuntime('n1', { state: 'COMPLETED', outputData: { out: { value: 'x' } } } as never);

        await repository.save();

        for (const runtime of ['state', 'status', 'inputData', 'outputData', 'executionStats']) {
            expect(saves[0].nodes[0]).not.toHaveProperty(runtime);
        }
    });

    it('leaves the flow clean afterwards', async () => {
        const { http } = harness();
        const { engine, repository } = createFlowWorkspace({ http });
        await repository.load('f1');
        engine.transact('add', ops => ops.addNode({ type: 'input-text', position: { x: 9, y: 9 } }));

        await repository.save();

        expect(repository.isDirty()).toBe(false);
    });

    it('keeps an edit made while the save was in flight', async () => {
        // Invariant 2: rebaseline off the snapshot that was *sent*. Adopting the working
        // copy as it stands when the response lands would make edits typed during the
        // round trip vanish from the next diff — the user loses them silently.
        let release = (): void => undefined;
        const gate = new Promise<void>(resolve => {
            release = resolve;
        });
        const { http } = harness(flow(), { onSave: () => gate });
        const { engine, repository } = createFlowWorkspace({ http });
        await repository.load('f1');

        const saving = repository.save();
        engine.transact('late-edit', ops => ops.addNode({ type: 'input-text', position: { x: 50, y: 50 } }));
        release();
        await saving;

        expect(repository.isDirty()).toBe(true);
    });

    it('adopts the id the server minted for a new flow', async () => {
        const { http, calls } = harness(flow({ id: undefined }), { saveResponse: { id: 'server-made-this' } });
        const { engine, repository } = createFlowWorkspace({ http });
        await repository.load('0');
        engine.transact('add', ops => ops.addNode({ type: 'input-text', position: { x: 1, y: 1 } }));

        const first = await repository.save();
        await repository.save();

        expect(first.flowId).toBe('server-made-this');
        expect(calls.filter(c => c.path.endsWith('/save')).map(c => c.path)).toEqual([
            '/flows/0/save',
            '/flows/server-made-this/save',
        ]);
    });
});

describe('save by a non-owner editor', () => {
    const asEditor = () => flow({ isEditable: true, hasOwned: false });

    it('reports the structure the server dropped behind a 200', async () => {
        // Invariant 3: the server keeps their config overlay and discards added nodes,
        // answering 200 either way. This flag is the only warning the client gets.
        const { http } = harness(asEditor());
        const { engine, repository } = createFlowWorkspace({ http });
        await repository.load('f1');
        engine.transact('add', ops => ops.addNode({ type: 'input-text', position: { x: 9, y: 9 } }));

        const outcome = await repository.save();

        expect(outcome.structureDropped).toBe(true);
    });

    it('declines the new baseline, so the work still reads unsaved', async () => {
        const { http } = harness(asEditor());
        const { engine, repository } = createFlowWorkspace({ http });
        await repository.load('f1');
        engine.transact('add', ops => ops.addNode({ type: 'input-text', position: { x: 9, y: 9 } }));

        await repository.save();

        // Overstates what is left to save, which is the right way to be wrong here.
        expect(repository.isDirty()).toBe(true);
    });

    it('accepts a config-only edit, which the overlay can hold', async () => {
        const { http } = harness(asEditor());
        const { engine, repository } = createFlowWorkspace({ http });
        await repository.load('f1');
        engine.transact('config', ops => ops.updateNode('n1', { config: { value: 'edited' } }));

        const outcome = await repository.save();

        expect(outcome.structureDropped).toBe(false);
        expect(repository.isDirty()).toBe(false);
    });
});

describe('runNode', () => {
    const run = async (
        args: Parameters<ReturnType<typeof createFlowWorkspace>['repository']['runNode']>
    ): Promise<HttpRequest> => {
        const { http, calls } = harness();
        const { repository } = createFlowWorkspace({ http });
        await repository.load('f1');
        await repository.runNode(...args);
        return calls[calls.length - 1];
    };

    it('posts to the node run endpoint', async () => {
        const req = await run(['n1']);

        expect(req.method).toBe('POST');
        expect(req.path).toBe('/nodes/n1/run');
    });

    it('escapes an id that would otherwise change the path', async () => {
        const req = await run(['n1:out']);

        expect(req.path).toBe('/nodes/n1%3Aout/run');
    });

    it('sends async and propagate as explicit 0/1', async () => {
        // Omitting them lets the server environment default decide, which silently
        // overrides what the caller asked for.
        const req = await run(['n1', undefined, { async: false, propagate: false }]);

        expect(req.query).toMatchObject({ async: 0, propagate: 0 });
    });

    it('leaves out what the caller did not state', async () => {
        const req = await run(['n1', undefined, { async: true }]);

        expect(req.query).toMatchObject({ async: 1 });
        expect(req.query?.propagate).toBeUndefined();
        expect(req.query?.force).toBeUndefined();
    });

    it('carries force, setting and the socket connection', async () => {
        const req = await run(['n1', undefined, { force: true, setting: true, connection: 'c-1' }]);

        expect(req.query).toMatchObject({ force: 1, setting: 1, connection: 'c-1' });
    });

    it('sends a frontend block output back for the server to store', async () => {
        const req = await run(['n1', { output: { out: 'hello' } }]);

        expect(req.body).toEqual({ output: { out: 'hello' } });
    });

    it('sends an empty body when there is nothing to hand over', async () => {
        const req = await run(['n1']);

        expect(req.body).toEqual({});
    });
});

describe('block registry', () => {
    it('keys blocks by the type a node names, not by the row id', async () => {
        // A node says `type: 'input-text'`. The row's own id is `0001` and the row has no
        // `type` at all — only `$definition` does. Reading it off the row gave `undefined`
        // for every block, so the registry held one entry no node could ever match.
        const { http } = harness();
        const { repository } = createFlowWorkspace({ http });

        const registry = await repository.loadBlocks();

        expect(Object.keys(registry).sort()).toEqual(['input-text', 'process-llm']);
        expect(registry['input-text'].outputs).toEqual([{ id: 'out', type: 'text' }]);
    });

    it('asks for the expanded definitions, since a bare list has no types on it', async () => {
        const { http, calls } = harness();
        const { repository } = createFlowWorkspace({ http });

        await repository.loadBlocks();

        expect(calls[0].query).toMatchObject({ cores: 1, limit: -1 });
    });

    it('reads the server 0/1 flag as a boolean', async () => {
        const { http } = harness();
        const { repository } = createFlowWorkspace({ http });

        const registry = await repository.loadBlocks();

        expect(registry['input-text'].isFrontend).toBe(true);
        expect(registry['process-llm'].isFrontend).toBe(false);
    });

    it('skips a row with no definition rather than keying it undefined', async () => {
        const calls: HttpRequest[] = [];
        const http: HttpPort = {
            request: async <T>(req: HttpRequest) => {
                calls.push(req);
                return { status: 200, data: { list: [...BLOCKS, { id: '0009', stereo: 'input' }] } as T };
            },
        };
        const { repository } = createFlowWorkspace({ http });

        const registry = await repository.loadBlocks();

        expect(Object.keys(registry)).toHaveLength(2);
        expect(registry).not.toHaveProperty('undefined');
    });
});

describe('flowInfo', () => {
    it('is empty before anything is loaded', () => {
        const { http } = harness();
        const { repository } = createFlowWorkspace({ http });

        expect(repository.flowInfo()).toEqual({});
    });

    it('keeps what the load response said about the flow, not just about its graph', async () => {
        const rich = {
            ...flow(),
            name: 'Attendance ETL',
            description: 'nightly',
            isPublic: true,
            thumbnail: 'https://example.test/t.png',
        } as unknown as FlowFixture;
        const { http } = harness(rich);
        const { repository } = createFlowWorkspace({ http });

        await repository.load('f1');

        expect(repository.flowInfo()).toEqual({
            id: 'f1',
            name: 'Attendance ETL',
            description: 'nightly',
            isPublic: true,
            thumbnail: 'https://example.test/t.png',
            isEditable: true,
            hasOwned: true,
        });
    });

    it('reports the permissions a non-owner editor was given', async () => {
        const { http } = harness(flow({ isEditable: true, hasOwned: false }));
        const { repository } = createFlowWorkspace({ http });

        await repository.load('f1');

        expect(repository.flowInfo()).toMatchObject({ isEditable: true, hasOwned: false });
    });
});
