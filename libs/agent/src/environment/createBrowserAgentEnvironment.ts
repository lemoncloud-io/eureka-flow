import { createAgentEnvironment } from './createAgentEnvironment';
import { createBrowserAgentStorage } from '../storage';

import type { AgentEnvironmentSupportable, AgentTraceReporterSupportable } from './types';
import type { AgentStorageSupportable } from '../storage';

export interface BrowserAgentEnvironmentOptions {
    /** Override the default localStorage-backed storage (e.g. a different namespace). */
    storage?: AgentStorageSupportable;
    /** Namespace for the default storage; ignored when `storage` is provided. */
    keyPrefix?: string;
    /** Optional observability sink; omitted by default. */
    traceReporter?: AgentTraceReporterSupportable;
}

/**
 * The live-editor environment: `runtime: 'browser'`, persistent state via localStorage behind
 * the Storage interface, real clock and AbortController, forbidden capabilities frozen false.
 */
export const createBrowserAgentEnvironment = (
    options: BrowserAgentEnvironmentOptions = {}
): AgentEnvironmentSupportable =>
    createAgentEnvironment({
        runtime: 'browser',
        storage: options.storage ?? createBrowserAgentStorage({ keyPrefix: options.keyPrefix }),
        now: () => Date.now(),
        traceReporter: options.traceReporter,
    });
