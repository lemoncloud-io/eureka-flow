import { describe, expect, it } from 'vitest';

import { runDemo } from '../cli/demo';
import { createStubHttpPort } from '../cli/stubHttpPort';
import { createStubSocketPort } from '../cli/stubSocketPort';
import { createFlowWorkspace } from '../repository/workspace';
import { createRunSession } from '../runtime/runSession';

/**
 * The Phase 2 completion condition, as a test.
 *
 * `yarn engine:demo` runs the same code from a bundle under plain `node`; this keeps it
 * honest on every commit rather than only when someone remembers to run it.
 */
describe('headless demo', () => {
    it('runs load → add → undo → redo → save with no browser anywhere', async () => {
        const http = createStubHttpPort();
        const result = await runDemo(createFlowWorkspace({ http }), { flowId: 'demo-flow' });

        expect(result.nodeCountAfterLoad).toBe(2);
        expect(result.nodeCountAfterAdd).toBe(3);
        expect(result.nodeCountAfterUndo).toBe(2);
        expect(result.nodeCountAfterRedo).toBe(3);
        expect(result.structureDropped).toBe(false);
    });

    it('reads clean on load, dirty on edit, clean again on undo and after save', async () => {
        const http = createStubHttpPort();
        const result = await runDemo(createFlowWorkspace({ http }), { flowId: 'demo-flow' });

        expect(result.dirtyAfterLoad).toBe(false);
        expect(result.dirtyAfterAdd).toBe(true);
        expect(result.dirtyAfterUndo).toBe(false);
        expect(result.dirtyAfterSave).toBe(false);
    });

    it('asks for blocks, then the flow, then saves once', async () => {
        const http = createStubHttpPort();
        await runDemo(createFlowWorkspace({ http }), { flowId: 'demo-flow' });

        expect(http.calls.map(c => `${c.method} ${c.path}`)).toEqual([
            'GET /blocks/0/list',
            'GET /flows/demo-flow/load',
            'POST /flows/demo-flow/save',
        ]);
    });

    it('puts the whole graph in the save body', async () => {
        const http = createStubHttpPort();
        await runDemo(createFlowWorkspace({ http }), { flowId: 'demo-flow' });

        expect(http.lastSaveBody()?.nodes).toHaveLength(3);
        expect(http.lastSaveBody()?.edges).toHaveLength(1);
    });
});

/**
 * The Phase 4 completion condition: the engine can follow a run, not just an edit.
 *
 * The frame script ends with a stale RUNNING — a client that applies it walks the node
 * backwards out of COMPLETED, which is the failure the ordering rules exist to prevent.
 */
describe('headless run', () => {
    const frames = (nodeId: string): unknown[] => [
        { type: 'node', id: nodeId, flowId: 'demo-flow', runId: 'run-1', no: 1, state: 'RUNNING', stage: 'enter' },
        { type: 'node/port', id: `${nodeId}:out@out`, flowId: 'demo-flow', runId: 'run-1', no: 1, ts: 1 },
        { type: 'node', id: nodeId, flowId: 'demo-flow', runId: 'run-1', no: 2, state: 'COMPLETED', stage: 'final' },
        { type: 'node', id: nodeId, flowId: 'demo-flow', runId: 'run-1', no: 2, state: 'RUNNING' },
    ];

    const stage = () => {
        const socket = createStubSocketPort();
        const http = createStubHttpPort({ onRun: nodeId => frames(nodeId).forEach(f => socket.emit(f)) });
        const workspace = createFlowWorkspace({ http });
        const session = createRunSession({ engine: workspace.engine, socket, currentFlowId: 'demo-flow' });
        socket.connect();
        return { http, workspace, session };
    };

    it('runs a node and follows it to completion, with no browser anywhere', async () => {
        const { workspace, session } = stage();

        const result = await runDemo(workspace, { flowId: 'demo-flow', session });

        expect(result.run).toMatchObject({ nodeId: 'n1', state: 'COMPLETED' });
    });

    it('leaves the node COMPLETED, having refused the stale frame behind it', async () => {
        const { workspace, session } = stage();

        const result = await runDemo(workspace, { flowId: 'demo-flow', session });

        expect(result.run?.stateInGraph).toBe('COMPLETED');
    });

    it('does not make the graph look unsaved — a run is not an edit', async () => {
        const { workspace, session } = stage();

        const result = await runDemo(workspace, { flowId: 'demo-flow', session });

        expect(result.run?.dirtyAfterRun).toBe(false);
    });

    it('asks the server to run the node', async () => {
        const { http, workspace, session } = stage();

        await runDemo(workspace, { flowId: 'demo-flow', session });

        expect(http.calls.map(c => c.path)).toContain('/nodes/n1/run');
    });

    it('skips the run step when no session is supplied', async () => {
        const result = await runDemo(createFlowWorkspace({ http: createStubHttpPort() }), { flowId: 'demo-flow' });

        expect(result.run).toBeUndefined();
    });
});
