import { runDemo } from './demo';
import { createStubHttpPort } from './stubHttpPort';
import { createFetchHttpPort } from '../adapters/fetchHttpPort';
import { createApiKeyAuth } from '../ports/auth';
import { createFlowWorkspace } from '../repository/workspace';

import type { HttpPort } from '../ports/http';

/**
 * `load → add → undo → redo → save`, in Node, with no browser anywhere.
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

    if (real) {
        const baseUrl = process.env.FLOW_API_URL;
        const apiKey = process.env.FLOW_API_KEY ?? null;
        flowId = flagValue('--flow') ?? '0';
        if (!baseUrl) throw new Error('--real needs FLOW_API_URL (and usually FLOW_API_KEY)');
        http = createFetchHttpPort({ baseUrl, auth: createApiKeyAuth(apiKey) });
        console.log(`mode: real server ${baseUrl} · flow ${flowId} · key ${apiKey ? 'present' : 'none (public)'}`);
    } else {
        http = createStubHttpPort();
        flowId = flagValue('--flow') ?? 'demo-flow';
        console.log('mode: stub server (no network) — pass --real with FLOW_API_URL to hit a live one');
    }

    const workspace = createFlowWorkspace({ http });
    const result = await runDemo(workspace, { flowId, log: line => console.log(line) });

    const stub = http as ReturnType<typeof createStubHttpPort>;
    if (!real && stub.lastSaveBody) {
        const body = stub.lastSaveBody();
        console.log('\n[receipt] requests:', stub.calls.map(c => `${c.method} ${c.path}`).join(' · '));
        console.log(
            `[receipt] save body: ${body?.nodes.length} nodes, ${body?.edges.length} edges` +
                ' (whole graph — save is a replace, not a patch)'
        );
    }

    const ok =
        result.nodeCountAfterUndo === result.nodeCountAfterLoad &&
        result.nodeCountAfterRedo === result.nodeCountAfterAdd &&
        !result.dirtyAfterLoad &&
        result.dirtyAfterAdd &&
        !result.dirtyAfterUndo &&
        !result.dirtyAfterSave;

    console.log(`\n${ok ? 'OK' : 'FAILED'} — engine ran headless: load → add → undo → redo → save`);
    if (!ok) process.exitCode = 1;
};

main().catch((error: unknown) => {
    console.error('\nFAILED —', error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
