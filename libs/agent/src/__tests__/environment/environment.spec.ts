import { describe, expect, it } from 'vitest';

import { createBrowserAgentEnvironment } from '../../environment/createBrowserAgentEnvironment';
import { createVirtualAgentEnvironment } from '../../environment/createVirtualAgentEnvironment';
import { createMemoryAgentStorage } from '../../environment/storage/MemoryAgentStorage';
import { BufferAgentTraceReporter } from '../../environment/trace/traceReporters';

describe('createVirtualAgentEnvironment', () => {
    it('has runtime node-virtual', () => {
        expect(createVirtualAgentEnvironment().runtime).toBe('node-virtual');
    });

    it('declares every forbidden capability as false, frozen', () => {
        const { capabilities } = createVirtualAgentEnvironment();

        expect(capabilities).toEqual({
            allowEval: false,
            allowFunctionConstructor: false,
            allowFileSystem: false,
            allowArbitraryNetwork: false,
            allowArbitraryScriptExecution: false,
        });
        expect(Object.isFrozen(capabilities)).toBe(true);
        // A sandbox that can be widened at runtime is no sandbox.
        expect(() => {
            (capabilities as unknown as Record<string, unknown>)['allowEval'] = true;
        }).toThrow();
    });

    it('uses memory storage by default', async () => {
        const env = createVirtualAgentEnvironment();

        await env.storage.setJson('k', 'v');
        await expect(env.storage.getJson('k')).resolves.toBe('v');
    });

    it('accepts an injected deterministic clock', () => {
        const env = createVirtualAgentEnvironment({ now: () => 1234 });

        expect(env.now()).toBe(1234);
    });

    it('defaults now() to the real clock', () => {
        const before = Date.now();
        const value = createVirtualAgentEnvironment().now();

        expect(value).toBeGreaterThanOrEqual(before);
    });

    it('creates working AbortControllers', () => {
        const controller = createVirtualAgentEnvironment().createAbortController();

        expect(controller.signal.aborted).toBe(false);
        controller.abort();
        expect(controller.signal.aborted).toBe(true);
    });

    it('close() flushes and closes the trace reporter', () => {
        const reporter = new BufferAgentTraceReporter();
        const env = createVirtualAgentEnvironment({ traceReporter: reporter });

        env.close?.();

        expect(reporter.flushCount).toBe(1);
        expect(reporter.isClosed).toBe(true);
    });
});

describe('createBrowserAgentEnvironment', () => {
    // Storage is injected in these tests: plain node has no localStorage, and the default
    // (localStorage-backed) path is covered by browser-storage.spec.ts.
    it('has runtime browser and the same frozen forbidden capabilities', () => {
        const env = createBrowserAgentEnvironment({ storage: createMemoryAgentStorage() });

        expect(env.runtime).toBe('browser');
        expect(Object.isFrozen(env.capabilities)).toBe(true);
        expect(Object.values(env.capabilities).every(allowed => allowed === false)).toBe(true);
    });

    it('fails loudly when no storage is injected and localStorage is unavailable', () => {
        expect(() => createBrowserAgentEnvironment()).toThrow(/localStorage is not available/);
    });
});
