import { AGENT_ENVIRONMENT_CAPABILITIES } from './types';

import type { AgentEnvironmentSupportable, AgentRuntime, AgentTraceReporterSupportable } from './types';
import type { AgentStorageSupportable } from '../storage';

interface AgentEnvironmentInput {
    runtime: AgentRuntime;
    storage: AgentStorageSupportable;
    now: () => number;
    traceReporter?: AgentTraceReporterSupportable;
}

/**
 * Shared assembly for the concrete environments — only the runtime tag, storage backing, and
 * clock differ between browser and node-virtual. The forbidden capabilities, abort factory, and
 * trace teardown are identical, so they live here once. Internal to the environment module.
 */
export const createAgentEnvironment = ({
    runtime,
    storage,
    now,
    traceReporter,
}: AgentEnvironmentInput): AgentEnvironmentSupportable => ({
    runtime,
    storage,
    ...(traceReporter ? { traceReporter } : {}),
    capabilities: AGENT_ENVIRONMENT_CAPABILITIES,
    now,
    createAbortController: () => new AbortController(),
    close: () => {
        traceReporter?.flush();
        traceReporter?.close();
    },
});
