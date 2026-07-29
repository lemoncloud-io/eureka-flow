import { errorMessage } from '../utils/errors';

import type { AgentEnvironmentSupportable, AgentRuntime } from './types';

export interface AgentEnvironmentCheck {
    name: 'storage' | 'trace';
    ok: boolean;
    detail: string;
}

export interface AgentEnvironmentSelfCheckResult {
    ok: boolean;
    runtime: AgentRuntime;
    checks: AgentEnvironmentCheck[];
}

const SELF_CHECK_KEY_PREFIX = 'selfcheck:';

/** Probe the environment's base services (storage write/read/remove round-trip, trace emit/flush); reports per-check status and never throws. */
export const runAgentEnvironmentSelfCheck = async (
    environment: AgentEnvironmentSupportable
): Promise<AgentEnvironmentSelfCheckResult> => {
    const checks: AgentEnvironmentCheck[] = [];

    const key = `${SELF_CHECK_KEY_PREFIX}${environment.now()}`;

    try {
        await environment.storage.setJson(key, { probe: true });
        const stored = await environment.storage.getJson<{ probe: boolean }>(key);
        await environment.storage.remove(key);
        const removed = await environment.storage.getJson(key);

        const ok = stored?.probe === true && removed === null;

        checks.push({
            name: 'storage',
            ok,
            detail: ok ? 'write/read/remove round-trip succeeded' : 'round-trip returned an unexpected value',
        });
    } catch (error) {
        checks.push({ name: 'storage', ok: false, detail: errorMessage(error) });
    }

    try {
        const reporter = environment.traceReporter;

        if (reporter) {
            reporter.debug('selfcheck.trace', { probe: true, apiKey: 'must-be-redacted' });
            reporter.flush();
            checks.push({ name: 'trace', ok: true, detail: 'trace entry emitted and flushed' });
        } else {
            checks.push({ name: 'trace', ok: true, detail: 'no trace reporter configured (noop path)' });
        }
    } catch (error) {
        checks.push({ name: 'trace', ok: false, detail: errorMessage(error) });
    }

    return {
        ok: checks.every(check => check.ok),
        runtime: environment.runtime,
        checks,
    };
};
