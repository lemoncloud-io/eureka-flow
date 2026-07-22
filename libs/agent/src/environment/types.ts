/** Browser Agent environment contract: the agent's only window onto the outside world. */

export type AgentRuntime = 'browser' | 'node-virtual';

/** Forbidden capabilities, each typed literal `false` so an implementation that allows one fails to compile. */
export interface AgentEnvironmentCapabilities {
    readonly allowEval: false;
    readonly allowFunctionConstructor: false;
    readonly allowFileSystem: false;
    readonly allowArbitraryNetwork: false;
    readonly allowArbitraryScriptExecution: false;
}

/** The agent's only sanctioned path to persistent state. Keys are strings, values are JSON; JSON errors reject loudly with the offending key. */
export interface AgentStorageSupportable {
    /** Read and parse a JSON value; resolves null when the key is absent. Rejects on corrupt JSON. */
    getJson<T>(key: string): Promise<T | null>;
    /** Serialize and store a JSON value. Rejects when the value cannot be serialized. */
    setJson<T>(key: string, value: T): Promise<void>;
    /** Remove a single key (no-op when absent). */
    remove(key: string): Promise<void>;
    /** List stored keys that start with the given prefix ('' lists all). */
    listKeys(prefix: string): Promise<string[]>;
    /** Optional: remove keys matching the prefix, or all of the agent's keys when omitted. */
    clear?(prefix?: string): Promise<void>;
}

export type AgentTraceLevel = 'debug' | 'info' | 'warn' | 'error';

/** Debugging/observability sink. Reporters must never log secrets or API keys — see redactSecrets in traceReporters.ts. */
export interface AgentTraceReporterSupportable {
    log(level: AgentTraceLevel, message: string, json?: Record<string, unknown>): void;
    debug(message: string, json?: Record<string, unknown>): void;
    info(message: string, json?: Record<string, unknown>): void;
    warn(message: string, json?: Record<string, unknown>): void;
    error(message: string, json?: Record<string, unknown>): void;
    /** Flush buffered entries to the sink. */
    flush(): void;
    /** Close the reporter; further entries may be dropped. */
    close(): void;
}

export interface AgentEnvironmentSupportable {
    /** Which runtime this environment represents. */
    readonly runtime: AgentRuntime;
    /** The only sanctioned path to persistent state. */
    readonly storage: AgentStorageSupportable;
    /** Optional debugging/observability sink. */
    readonly traceReporter?: AgentTraceReporterSupportable;
    /** Immutable declaration of forbidden capabilities (all false, frozen). */
    readonly capabilities: AgentEnvironmentCapabilities;
    /** Current epoch milliseconds. Injectable in the virtual runtime for deterministic tests. */
    now(): number;
    /** Create an AbortController used to cancel a turn/tool at a safe boundary. */
    createAbortController(): AbortController;
    /** Optional teardown: flush/close the trace reporter and release resources. */
    close?(): void;
}

/** The single shared capabilities value, frozen so it cannot be widened at runtime. */
export const AGENT_ENVIRONMENT_CAPABILITIES: AgentEnvironmentCapabilities = Object.freeze({
    allowEval: false,
    allowFunctionConstructor: false,
    allowFileSystem: false,
    allowArbitraryNetwork: false,
    allowArbitraryScriptExecution: false,
} as const);
