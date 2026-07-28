import { createAgentEnvironment } from './createAgentEnvironment';
import { createBrowserAgentStorage } from './storage/BrowserAgentStorage';

import type { AgentEnvironmentSupportable, AgentStorageSupportable, AgentTraceReporterSupportable } from './types';

export interface BrowserAgentEnvironmentOptions {
    /** Override the default localStorage-backed storage (e.g. a different namespace). */
    storage?: AgentStorageSupportable;
    /** Namespace for the default storage; ignored when `storage` is provided. */
    keyPrefix?: string;
    /** Optional observability sink; omitted by default. */
    traceReporter?: AgentTraceReporterSupportable;
}

/** The live-editor environment: `runtime: 'browser'` with localStorage-backed storage and real clock. */
export const createBrowserAgentEnvironment = (
    options: BrowserAgentEnvironmentOptions = {}
): AgentEnvironmentSupportable =>
    createAgentEnvironment({
        runtime: 'browser',
        storage: options.storage ?? createBrowserAgentStorage({ keyPrefix: options.keyPrefix }),
        now: () => Date.now(),
        traceReporter: options.traceReporter,
    });
