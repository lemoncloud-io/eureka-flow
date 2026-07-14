import { describe, expect, it } from 'vitest';

import { createVirtualAgentEnvironment } from '../createVirtualAgentEnvironment';
import { runAgentEnvironmentSelfCheck } from '../selfCheck';
import { createMemoryAgentStorage } from '../storage/MemoryAgentStorage';
import { BufferAgentTraceReporter } from '../trace/traceReporters';

describe('runAgentEnvironmentSelfCheck', () => {
    it('passes on a healthy virtual environment and cleans up its probe key', async () => {
        const storage = createMemoryAgentStorage();
        const environment = createVirtualAgentEnvironment({ storage, traceReporter: new BufferAgentTraceReporter() });

        const result = await runAgentEnvironmentSelfCheck(environment);

        expect(result.ok).toBe(true);
        expect(result.runtime).toBe('node-virtual');
        expect(result.checks.map(check => [check.name, check.ok])).toEqual([
            ['storage', true],
            ['trace', true],
        ]);
        await expect(storage.listKeys('selfcheck:')).resolves.toEqual([]);
    });

    it('redacts the probe secret in the emitted trace entry', async () => {
        const traceReporter = new BufferAgentTraceReporter();

        await runAgentEnvironmentSelfCheck(createVirtualAgentEnvironment({ traceReporter }));

        const entry = traceReporter.entries.find(candidate => candidate.message === 'selfcheck.trace');
        expect(entry?.json?.['apiKey']).toBe('[redacted]');
        expect(traceReporter.flushCount).toBeGreaterThan(0);
    });

    it('reports trace as ok with a noop detail when no reporter is configured', async () => {
        const result = await runAgentEnvironmentSelfCheck(createVirtualAgentEnvironment());

        const traceCheck = result.checks.find(check => check.name === 'trace');
        expect(traceCheck?.ok).toBe(true);
        expect(traceCheck?.detail).toContain('no trace reporter');
    });

    it('fails the storage check without throwing when storage is broken', async () => {
        const broken = createMemoryAgentStorage();
        broken.setJson = () => Promise.reject(new Error('quota exceeded'));

        const result = await runAgentEnvironmentSelfCheck(createVirtualAgentEnvironment({ storage: broken }));

        expect(result.ok).toBe(false);
        const storageCheck = result.checks.find(check => check.name === 'storage');
        expect(storageCheck?.ok).toBe(false);
        expect(storageCheck?.detail).toContain('quota exceeded');
    });
});
