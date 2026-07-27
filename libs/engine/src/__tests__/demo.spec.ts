import { describe, expect, it } from 'vitest';

import { runDemo } from '../cli/demo';
import { createStubHttpPort } from '../cli/stubHttpPort';
import { createFlowWorkspace } from '../repository/workspace';

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
