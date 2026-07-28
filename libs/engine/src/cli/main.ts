import { runDemo } from './demo';
import { createStubHttpPort } from './stubHttpPort';
import { createStubSocketPort } from './stubSocketPort';
import { createFetchHttpPort } from '../adapters/fetchHttpPort';
import { createWebSocketPort } from '../adapters/webSocketPort';
import { createApiKeyAuth } from '../ports/auth';
import { createFlowWorkspace } from '../repository/workspace';
import { createRunSession } from '../runtime/runSession';

import type { StubSocketPort } from './stubSocketPort';
import type { HttpPort } from '../ports/http';
import type { SocketPort } from '../ports/socket';

/**
 * One run, as the server would stream it.
 *
 * The last frame is deliberately stale: it says RUNNING with a sequence the client has
 * already passed. A client that applies it walks the node backwards out of COMPLETED,
 * which is the failure the ordering rules exist to prevent — so the demo sends one.
 */
const runFrames = (nodeId: string, flowId: string): unknown[] => [
    { type: 'node', id: nodeId, flowId, runId: 'run-1', no: 1, state: 'RUNNING', stage: 'enter' },
    { type: 'node/port', id: `${nodeId}:out@out`, flowId, runId: 'run-1', no: 1, ts: 1 },
    { type: 'node', id: nodeId, flowId, runId: 'run-1', no: 2, state: 'COMPLETED', stage: 'final', progress: 100 },
    { type: 'node', id: nodeId, flowId, runId: 'run-1', no: 2, state: 'RUNNING' },
];

/**
 * `load → add → undo → redo → save → run`, in Node, with no browser anywhere.
 *
 * Not exported from the barrel: this is the only file in the engine that touches
 * `process`, and a browser bundle has no reason to pull it in.
 */
const main = async (): Promise<void> => {
    const argv = process.argv.slice(2);
    const real = argv.includes('--real');
    const flagValue = (name: string): string | undefined => {
        const i = argv.indexOf(name);
        return i >= 0 ? argv[i + 1] : undefined;
    };

    let http: HttpPort;
    let flowId: string;
    let socket: SocketPort | undefined;
    let stub: StubSocketPort | undefined;

    if (real) {
        const baseUrl = process.env.FLOW_API_URL;
        const apiKey = process.env.FLOW_API_KEY ?? null;
        flowId = flagValue('--flow') ?? '0';
        if (!baseUrl) throw new Error('--real needs FLOW_API_URL (and usually FLOW_API_KEY)');
        http = createFetchHttpPort({ baseUrl, auth: createApiKeyAuth(apiKey) });

        // The same query the browser's worker builds: token, then the channel to listen on.
        // `channels` is what the editor sends today — the load response carries no channel
        // id despite what the client looks for, so both fall back to the same default.
        const wsUrl = process.env.FLOW_WS_URL;
        if (wsUrl) {
            const url = new URL(wsUrl);
            if (apiKey) url.searchParams.set('x-api-key', apiKey);
            url.searchParams.set('info', '');
            url.searchParams.set('channels', flagValue('--channel') ?? '0000');
            socket = createWebSocketPort({ url: url.toString() });
        }

        console.log(
            `mode: real server ${baseUrl} · flow ${flowId} · key ${apiKey ? 'present' : 'none (public)'}` +
                ` · socket ${socket ? wsUrl : 'off (set FLOW_WS_URL)'}`
        );
    } else {
        flowId = flagValue('--flow') ?? 'demo-flow';
        stub = createStubSocketPort();
        socket = stub;
        // A real server accepts the run and then streams it. The stub does both halves in
        // the same order, which is why the demo can wait on the result at all.
        http = createStubHttpPort({
            onRun: nodeId => runFrames(nodeId, flowId).forEach(frame => stub?.emit(frame)),
        });
        console.log('mode: stub server (no network) — pass --real with FLOW_API_URL to hit a live one');
    }

    const workspace = createFlowWorkspace({ http });
    const session = socket ? createRunSession({ engine: workspace.engine, socket, currentFlowId: flowId }) : undefined;
    socket?.connect();

    // Against a real server every step past the load writes to somebody's flow: the save is
    // a whole-graph replace, and the run executes and bills. The stub has nothing to damage,
    // so it still does all of it; a real server does the load and stops unless asked.
    const wantsWrite = !real || argv.includes('--write');
    const wantsRun = wantsWrite && (!real || argv.includes('--run'));
    if (real && !wantsWrite) console.log('read-only — pass --write to also add and save, --write --run to execute');

    const result = await runDemo(workspace, {
        flowId,
        readOnly: !wantsWrite,
        session: wantsRun ? session : undefined,
        log: line => console.log(line),
    });

    const stubHttp = http as ReturnType<typeof createStubHttpPort>;
    if (!real && stubHttp.lastSaveBody) {
        const body = stubHttp.lastSaveBody();
        console.log('\n[receipt] requests:', stubHttp.calls.map(c => `${c.method} ${c.path}`).join(' · '));
        console.log(
            `[receipt] save body: ${body?.nodes.length} nodes, ${body?.edges.length} edges` +
                ' (whole graph — save is a replace, not a patch)'
        );
    }

    session?.close();
    socket?.close();

    // A read-only run proves one thing — the load — so that is all it is allowed to claim.
    // Checking the edit invariants against numbers nothing produced would pass by default.
    const editOk = result.readOnly
        ? !result.dirtyAfterLoad
        : result.nodeCountAfterUndo === result.nodeCountAfterLoad &&
          result.nodeCountAfterRedo === result.nodeCountAfterAdd &&
          !result.dirtyAfterLoad &&
          result.dirtyAfterAdd &&
          !result.dirtyAfterUndo &&
          !result.dirtyAfterSave;

    // `stateInGraph` is the strict half: the stub's last frame is stale, so anything other
    // than COMPLETED means the ordering rules let the node walk backwards.
    const runOk =
        !result.run ||
        (result.run.state === 'COMPLETED' && result.run.stateInGraph === 'COMPLETED' && !result.run.dirtyAfterRun);

    const ok = editOk && runOk;
    const steps = result.readOnly
        ? 'load (read-only)'
        : result.run
          ? 'load → add → undo → redo → save → run'
          : 'load → add → undo → redo → save';

    console.log(`\n${ok ? 'OK' : 'FAILED'} — engine ran headless: ${steps}`);
    if (!ok) process.exitCode = 1;
};

main().catch((error: unknown) => {
    console.error('\nFAILED —', error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
