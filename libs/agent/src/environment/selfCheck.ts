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

const toErrorDetail = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Verify the environment's base services in the runtime it actually runs in — W04's
 * real-browser self-check. Storage is probed with a write/read/remove round-trip under a
 * `selfcheck:` key (cleaned up afterwards); trace by emitting and flushing one entry.
 *
 * In the real browser, run it from the app (or console) against the live environment:
 *
 *     const result = await runAgentEnvironmentSelfCheck(createBrowserAgentEnvironment());
 *
 * The result reports per-check status; it never throws.
 */
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
        checks.push({ name: 'storage', ok: false, detail: toErrorDetail(error) });
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
        checks.push({ name: 'trace', ok: false, detail: toErrorDetail(error) });
    }

    return {
        ok: checks.every(check => check.ok),
        runtime: environment.runtime,
        checks,
    };
};
