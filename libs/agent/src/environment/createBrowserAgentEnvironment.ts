import { createBrowserAgentStorage } from './storage/BrowserAgentStorage';
import { AGENT_ENVIRONMENT_CAPABILITIES } from './types';

import type { AgentEnvironmentSupportable, AgentStorageSupportable, AgentTraceReporterSupportable } from './types';

export interface BrowserAgentEnvironmentOptions {
    /** Override the default localStorage-backed storage (e.g. a different namespace). */
    storage?: AgentStorageSupportable;
    /** Namespace for the default storage; ignored when `storage` is provided. */
    keyPrefix?: string;
    /** Optional observability sink; omitted by default. */
    traceReporter?: AgentTraceReporterSupportable;
}

/**
 * The live-editor environment: `runtime: 'browser'`, persistent state via localStorage
 * behind the Storage interface, real clock, real AbortController — and every forbidden
 * capability (eval, Function constructor, filesystem, arbitrary network/script) declared
 * immutably false.
 */
export const createBrowserAgentEnvironment = (
    options: BrowserAgentEnvironmentOptions = {}
): AgentEnvironmentSupportable => {
    const storage = options.storage ?? createBrowserAgentStorage({ keyPrefix: options.keyPrefix });
    const traceReporter = options.traceReporter;

    return {
        runtime: 'browser',
        storage,
        ...(traceReporter ? { traceReporter } : {}),
        capabilities: AGENT_ENVIRONMENT_CAPABILITIES,
        now: () => Date.now(),
        createAbortController: () => new AbortController(),
        close: () => {
            traceReporter?.flush();
            traceReporter?.close();
        },
    };
};
