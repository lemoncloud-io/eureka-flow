import { isPlainObject } from '../../utils/json';

import type { AgentTraceLevel, AgentTraceReporterSupportable } from '../types';

/** Key-name substrings whose values are redacted from traces — deliberately broad: "key" also catches "apiKey". */
const SECRET_KEY_PATTERN = /key|token|secret|password|credential|authorization/i;

const REDACTED = '[redacted]';
const MAX_REDACT_DEPTH = 3;

/** Copy of a trace payload with secret-looking fields replaced by "[redacted]". */
export const redactSecrets = (json: Record<string, unknown>, depth = MAX_REDACT_DEPTH): Record<string, unknown> => {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(json)) {
        if (SECRET_KEY_PATTERN.test(key)) {
            result[key] = REDACTED;
        } else if (depth > 1 && isPlainObject(value)) {
            result[key] = redactSecrets(value, depth - 1);
        } else {
            result[key] = value;
        }
    }

    return result;
};

/** A reporter that drops everything — the default when no observability sink is wired. */
export class NoopAgentTraceReporter implements AgentTraceReporterSupportable {
    log(_level: AgentTraceLevel, _message: string, _json?: Record<string, unknown>): void {
        // intentionally empty
    }

    debug(_message: string, _json?: Record<string, unknown>): void {
        // intentionally empty
    }

    info(_message: string, _json?: Record<string, unknown>): void {
        // intentionally empty
    }

    warn(_message: string, _json?: Record<string, unknown>): void {
        // intentionally empty
    }

    error(_message: string, _json?: Record<string, unknown>): void {
        // intentionally empty
    }

    flush(): void {
        // intentionally empty
    }

    close(): void {
        // intentionally empty
    }
}

export interface AgentTraceEntry {
    level: AgentTraceLevel;
    message: string;
    json?: Record<string, unknown>;
    ts: number;
}

/** A reporter that buffers redacted entries in memory; a closed reporter drops further entries. */
export class BufferAgentTraceReporter implements AgentTraceReporterSupportable {
    readonly entries: AgentTraceEntry[] = [];
    flushCount = 0;
    private closed = false;

    constructor(private readonly now: () => number = Date.now) {}

    log(level: AgentTraceLevel, message: string, json?: Record<string, unknown>): void {
        if (this.closed) {
            return;
        }

        this.entries.push({
            level,
            message,
            ...(json ? { json: redactSecrets(json) } : {}),
            ts: this.now(),
        });
    }

    debug(message: string, json?: Record<string, unknown>): void {
        this.log('debug', message, json);
    }

    info(message: string, json?: Record<string, unknown>): void {
        this.log('info', message, json);
    }

    warn(message: string, json?: Record<string, unknown>): void {
        this.log('warn', message, json);
    }

    error(message: string, json?: Record<string, unknown>): void {
        this.log('error', message, json);
    }

    flush(): void {
        this.flushCount += 1;
    }

    close(): void {
        this.closed = true;
    }

    get isClosed(): boolean {
        return this.closed;
    }
}
