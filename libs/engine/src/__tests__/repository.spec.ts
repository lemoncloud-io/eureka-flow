import { describe, expect, it } from 'vitest';

import { createFlowWorkspace } from '../repository/workspace';

import type { HttpPort, HttpRequest } from '../ports/http';
import type { BlockDefinitionWithFrontend } from '../types';
import type { EdgeData, NodeData } from '@lemoncloud/eureka-flows-api';

const BLOCKS = [
    { type: 'input-text', inputs: [], outputs: [{ id: 'out', type: 'text' }], defaultConfig: { value: '' } },
    { type: 'process-llm', inputs: [{ id: 'in', type: 'text' }], outputs: [{ id: 'out', type: 'text' }] },
] as unknown as BlockDefinitionWithFrontend[];

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
            if (req.path === '/blocks/0/list') return { status: 200, data: BLOCKS as T };
            if (req.path.endsWith('/load')) return { status: 200, data: structuredClone(fixture) as T };
            if (req.path.endsWith('/save')) {
                saves.push(req.body as { nodes: NodeData[]; edges: EdgeData[] });
                await hooks.onSave?.();
                return { status: 200, data: (hooks.saveResponse ?? { id: fixture.id }) as T };
            }
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
