import { useEffect, useMemo } from 'react';

import { BufferAgentTraceReporter, NoopAgentTraceReporter, createBrowserAgentEnvironment } from '@flows/agent';

import type { AgentEnvironmentSupportable, AgentTraceLevel, AgentTraceReporterSupportable } from '@flows/agent';

export interface AgentTraceEntrySnapshot {
    level: AgentTraceLevel;
    message: string;
    ts: number;
}

export interface AgentEnvironmentHandle {
    environment: AgentEnvironmentSupportable;
    traceReporter: AgentTraceReporterSupportable;
    /** Dev/test observability: snapshot of buffered entries (level + message + ts only, no payloads). Empty in prod. */
    getTraceEntries: () => AgentTraceEntrySnapshot[];
}

/**
 * One BrowserAgentEnvironment per editor page — the app-side wiring that makes the real
 * agent run flow through the Environment: persistent state via its storage port
 * (`flow_mosaic_agent_` namespace) and lifecycle events via its trace reporter.
 *
 * Dev/test keeps a buffered reporter so real-browser verification can assert the trace of
 * an actual run through the UI (no DevTools triggering, no self-check helper); production
 * uses the noop reporter. The environment intentionally lives for the page's lifetime —
 * it is not closed on unmount, so StrictMode's remount cannot silence the reporter.
 */
export const useAgentEnvironment = (): AgentEnvironmentHandle => {
    const handle = useMemo<AgentEnvironmentHandle>(() => {
        const buffered = import.meta.env.DEV ? new BufferAgentTraceReporter() : null;
        const traceReporter = buffered ?? new NoopAgentTraceReporter();
        const environment = createBrowserAgentEnvironment({ traceReporter });

        return {
            environment,
            traceReporter,
            getTraceEntries: () =>
                buffered
                    ? buffered.entries.map(entry => ({ level: entry.level, message: entry.message, ts: entry.ts }))
                    : [],
        };
    }, []);

    // Dev-only read-only accessor for browser-level tests (Playwright/manual): exposes
    // level+message+ts snapshots, never payloads. Reading it is assertion, not triggering.
    useEffect(() => {
        if (!import.meta.env.DEV) {
            return undefined;
        }
        (window as unknown as Record<string, unknown>)['__flowAgentTrace'] = handle.getTraceEntries;
        return () => {
            delete (window as unknown as Record<string, unknown>)['__flowAgentTrace'];
        };
    }, [handle]);

    return handle;
};
