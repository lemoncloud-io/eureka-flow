import { useEffect, useMemo } from 'react';

import { NoopTracer, createBrowserAgentStorage, createTracer, memorySink, redactingSink } from '@flows/agent';

import type { AgentStorage, TraceRecord, Tracer } from '@flows/agent';

export interface AgentTraceEntrySnapshot {
    level: string;
    event: string;
    ts: number;
}

export interface AgentHostHandle {
    /** Per-flow session persistence (localStorage, `flow_mosaic_agent_` namespace). */
    storage: AgentStorage;
    /** The tracer injected into the agent; every run event flows through it. */
    tracer: Tracer;
    /** Dev/test trace snapshot: level + event name + ts (redacted). Empty in prod. */
    getTraceEntries: () => AgentTraceEntrySnapshot[];
}

/**
 * One agent host per editor page: a localStorage-backed persistence port and a tracer. Dev keeps a redacted
 * in-memory buffer so a real-browser run's trace is assertable; production discards trace events (NoopTracer).
 * Lives for the page's lifetime — StrictMode's remount cannot silence it.
 */
export const useAgentHost = (): AgentHostHandle => {
    const handle = useMemo<AgentHostHandle>(() => {
        const storage = createBrowserAgentStorage();
        const buffer = import.meta.env.DEV ? memorySink() : null;
        const tracer = buffer ? createTracer(redactingSink(buffer)) : NoopTracer;

        return {
            storage,
            tracer,
            getTraceEntries: () =>
                buffer ? buffer.records.map((r: TraceRecord) => ({ level: r.level, event: r.name, ts: r.ts })) : [],
        };
    }, []);

    // Dev-only read-only accessor for browser-level tests (Playwright/manual): level+event+ts snapshots only.
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
