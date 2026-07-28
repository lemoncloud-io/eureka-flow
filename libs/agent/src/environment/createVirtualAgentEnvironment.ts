import { createAgentEnvironment } from './createAgentEnvironment';
import { createMemoryAgentStorage } from './storage/MemoryAgentStorage';

import type { AgentEnvironmentSupportable, AgentStorageSupportable, AgentTraceReporterSupportable } from './types';

export interface VirtualAgentEnvironmentOptions {
    /** Override the default in-memory storage (e.g. pre-seeded for a test). */
    storage?: AgentStorageSupportable;
    /** Optional observability sink (BufferAgentTraceReporter makes traces assertable). */
    traceReporter?: AgentTraceReporterSupportable;
    /** Injectable clock for deterministic tests; defaults to Date.now. */
    now?: () => number;
}

/** The virtual Node.js test environment: `runtime: 'node-virtual'`, memory storage, injectable clock. */
export const createVirtualAgentEnvironment = (
    options: VirtualAgentEnvironmentOptions = {}
): AgentEnvironmentSupportable =>
    createAgentEnvironment({
        runtime: 'node-virtual',
        storage: options.storage ?? createMemoryAgentStorage(),
        now: options.now ?? (() => Date.now()),
        traceReporter: options.traceReporter,
    });
