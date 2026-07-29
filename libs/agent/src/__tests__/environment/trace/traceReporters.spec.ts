import { describe, expect, it } from 'vitest';

import {
    BufferAgentTraceReporter,
    NoopAgentTraceReporter,
    redactSecrets,
} from '../../../environment/trace/traceReporters';

describe('BufferAgentTraceReporter', () => {
    it('buffers entries for every level with a timestamp from the injected clock', () => {
        const reporter = new BufferAgentTraceReporter(() => 777);

        reporter.log('info', 'explicit level');
        reporter.debug('d');
        reporter.info('i');
        reporter.warn('w');
        reporter.error('e', { step: 3 });

        expect(reporter.entries.map(entry => entry.level)).toEqual(['info', 'debug', 'info', 'warn', 'error']);
        expect(reporter.entries[0]).toEqual({ level: 'info', message: 'explicit level', ts: 777 });
        expect(reporter.entries[4]).toEqual({ level: 'error', message: 'e', json: { step: 3 }, ts: 777 });
    });

    it('redacts secret-looking fields before storing', () => {
        const reporter = new BufferAgentTraceReporter();

        reporter.info('gateway configured', {
            apiKey: 'sk-super-secret',
            model: 'gpt-x',
            nested: { authorization: 'Bearer abc', safe: 1 },
        });

        expect(reporter.entries[0].json).toEqual({
            apiKey: '[redacted]',
            model: 'gpt-x',
            nested: { authorization: '[redacted]', safe: 1 },
        });
    });

    it('counts flushes and drops entries after close', () => {
        const reporter = new BufferAgentTraceReporter();

        reporter.flush();
        reporter.flush();
        expect(reporter.flushCount).toBe(2);

        reporter.close();
        reporter.info('after close');

        expect(reporter.isClosed).toBe(true);
        expect(reporter.entries).toHaveLength(0);
    });
});

describe('NoopAgentTraceReporter', () => {
    it('accepts every call without throwing', () => {
        const reporter = new NoopAgentTraceReporter();

        expect(() => {
            reporter.log('info', 'm');
            reporter.debug('m');
            reporter.info('m');
            reporter.warn('m');
            reporter.error('m');
            reporter.flush();
            reporter.close();
        }).not.toThrow();
    });
});

describe('redactSecrets', () => {
    it('replaces values whose keys look secret, keeps the rest', () => {
        expect(redactSecrets({ token: 't', password: 'p', clientSecret: 's', flowId: 'flow-1', count: 2 })).toEqual({
            token: '[redacted]',
            password: '[redacted]',
            clientSecret: '[redacted]',
            flowId: 'flow-1',
            count: 2,
        });
    });

    it('does not mutate the input', () => {
        const input = { apiKey: 'k', nested: { credential: 'c' } };

        redactSecrets(input);

        expect(input).toEqual({ apiKey: 'k', nested: { credential: 'c' } });
    });
});
