import { assertStorageKey, parseStoredJson, serializeJson } from './json';

import type { AgentStorageSupportable } from '../types';

export interface MemoryAgentStorageOptions {
    /** Pre-seeded raw entries (already-serialized JSON strings), mainly for tests. */
    seed?: Record<string, string>;
}

/** In-memory AgentStorageSupportable (Map-backed) for the 'node-virtual' test runtime. Not for production persistence. */
export const createMemoryAgentStorage = (options: MemoryAgentStorageOptions = {}): AgentStorageSupportable => {
    const values = new Map<string, string>(Object.entries(options.seed ?? {}));

    return {
        async getJson<T>(key: string): Promise<T | null> {
            assertStorageKey(key);
            const raw = values.get(key);
            return raw === undefined ? null : parseStoredJson<T>(key, raw);
        },

        async setJson<T>(key: string, value: T): Promise<void> {
            assertStorageKey(key);
            values.set(key, serializeJson(key, value));
        },

        async remove(key: string): Promise<void> {
            assertStorageKey(key);
            values.delete(key);
        },

        async listKeys(prefix: string): Promise<string[]> {
            return [...values.keys()].filter(key => key.startsWith(prefix));
        },

        async clear(prefix?: string): Promise<void> {
            if (prefix === undefined) {
                values.clear();
                return;
            }

            for (const key of [...values.keys()]) {
                if (key.startsWith(prefix)) {
                    values.delete(key);
                }
            }
        },
    };
};
