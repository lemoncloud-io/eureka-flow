import { createMemoryAgentStorage } from './storage/MemoryAgentStorage';
import { AGENT_ENVIRONMENT_CAPABILITIES } from './types';

import type { AgentEnvironmentSupportable, AgentStorageSupportable, AgentTraceReporterSupportable } from './types';

export interface VirtualAgentEnvironmentOptions {
    /** Override the default in-memory storage (e.g. pre-seeded for a test). */
    storage?: AgentStorageSupportable;
    /** Optional observability sink (BufferAgentTraceReporter makes traces assertable). */
    traceReporter?: AgentTraceReporterSupportable;
    /** Injectable clock for deterministic tests; defaults to Date.now. */
    now?: () => number;
}

/**
 * The virtual Node.js environment for tests: `runtime: 'node-virtual'`, memory storage,
 * injectable clock — and the same immutable forbidden capabilities as the browser. No
 * filesystem, eval, Function constructor, or arbitrary execution is exposed to the agent
 * here either: the sandbox rules are identical, only the backing implementations change.
 */
export const createVirtualAgentEnvironment = (
    options: VirtualAgentEnvironmentOptions = {}
): AgentEnvironmentSupportable => {
    const storage = options.storage ?? createMemoryAgentStorage();
    const traceReporter = options.traceReporter;
    const now = options.now ?? (() => Date.now());

    return {
        runtime: 'node-virtual',
        storage,
        ...(traceReporter ? { traceReporter } : {}),
        capabilities: AGENT_ENVIRONMENT_CAPABILITIES,
        now,
        createAbortController: () => new AbortController(),
        close: () => {
            traceReporter?.flush();
            traceReporter?.close();
        },
    };
};
