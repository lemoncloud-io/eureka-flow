import { useEffect, useMemo } from 'react';

import { createAgentTrace, createBrowserAgentStorage } from '@flows/agent';

import type { AgentStorage, TraceProjections, Tracer } from '@flows/agent';

export interface AgentTraceEntrySnapshot {
    level: string;
    event: string;
    ts: number;
}

export interface AgentPorts {
    /** Per-flow session persistence (localStorage, `flow_mosaic_agent_` namespace). */
    storage: AgentStorage;
    /** The tracer injected into the agent; every run event flows through it (NoopTracer when tracing is off). */
    tracer: Tracer;
    /** Dev/test trace snapshot: level + event name + ts (redacted). Empty when tracing is off. */
    getTraceEntries: () => AgentTraceEntrySnapshot[];
    /** The captured run projected 3 ways (chat per agent, call tree, graph diff). Empty when tracing is off. */
    getProjections: () => TraceProjections;
}

/**
 * Is agent tracing on for this browser session? On automatically in dev builds; in ANY build (including a
 * deploy) a user can opt in at runtime with `?trace=1` in the URL or `localStorage.agentTrace = '1'`. This is
 * the web's read of the same one switch the node side reads from `AGENT_TRACE` — same capture, same 3
 * projections, per-runtime flag source. Off ⇒ NoopTracer, zero cost.
 */
const traceEnabled = (): boolean => {
    if (import.meta.env.DEV) {
        return true;
    }
    try {
        if (typeof window !== 'undefined') {
            if (new URLSearchParams(window.location.search).get('trace') === '1') {
                return true;
            }
            if (window.localStorage?.getItem('agentTrace') === '1') {
                return true;
            }
        }
    } catch {
        // localStorage can throw in private mode / sandboxed frames — treat as disabled.
    }
    return false;
};

/**
 * One agent host per editor page: a localStorage-backed persistence port and a tracer. When tracing is on
 * (see {@link traceEnabled}) the tracer captures a redacted record stream the run projects 3 ways; otherwise
 * it is a NoopTracer. Lives for the page's lifetime — StrictMode's remount cannot silence it.
 */
export const useAgentPorts = (): AgentPorts => {
    const ports = useMemo<AgentPorts>(() => {
        const storage = createBrowserAgentStorage();
        const trace = createAgentTrace(traceEnabled());
        return {
            storage,
            tracer: trace.tracer,
            getTraceEntries: () => trace.records().map(r => ({ level: r.level, event: r.name, ts: r.ts })),
            getProjections: () => trace.project(),
        };
    }, []);

    // Dev/test hooks for browser-level tests (Playwright/manual): read-only accessors on window when tracing is on.
    useEffect(() => {
        if (!traceEnabled()) {
            return undefined;
        }
        const win = window as unknown as Record<string, unknown>;
        win['__flowAgentTrace'] = ports.getTraceEntries;
        win['__flowAgentProjections'] = ports.getProjections;
        return () => {
            delete win['__flowAgentTrace'];
            delete win['__flowAgentProjections'];
        };
    }, [ports]);

    return ports;
};
