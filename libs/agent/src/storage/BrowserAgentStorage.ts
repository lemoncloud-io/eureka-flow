import { assertStorageKey, parseStoredJson, serializeJson } from './json';

import type { AgentStorage } from './types';

/** The subset of the DOM Storage API the browser storage needs; injectable for tests. */
export interface WebStorageLike {
    readonly length: number;
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    key(index: number): string | null;
}

export interface BrowserAgentStorageOptions {
    /** Namespace prepended to every physical key so clear() can't wipe unrelated app localStorage. */
    keyPrefix?: string;
    /** The backing store; defaults to globalThis.localStorage. Injectable for tests. */
    webStorage?: WebStorageLike;
}

const DEFAULT_KEY_PREFIX = 'flow_mosaic_agent_';

const resolveWebStorage = (provided?: WebStorageLike): WebStorageLike => {
    if (provided) {
        return provided;
    }

    const globalStorage = (globalThis as { localStorage?: WebStorageLike }).localStorage;

    if (!globalStorage) {
        throw new Error(
            'createBrowserAgentStorage: localStorage is not available in this runtime. ' +
                'Use createMemoryAgentStorage (node-virtual) or inject a webStorage implementation.'
        );
    }

    return globalStorage;
};

/** AgentStorage backed by localStorage; all keys live under a namespace prefix. */
export const createBrowserAgentStorage = (options: BrowserAgentStorageOptions = {}): AgentStorage => {
    const webStorage = resolveWebStorage(options.webStorage);
    const namespace = options.keyPrefix ?? DEFAULT_KEY_PREFIX;

    const physicalKey = (key: string): string => `${namespace}${key}`;

    /** All logical keys currently in the namespace (snapshot, so removal is index-safe). */
    const logicalKeys = (): string[] => {
        const keys: string[] = [];

        for (let i = 0; i < webStorage.length; i += 1) {
            const raw = webStorage.key(i);
            if (raw && raw.startsWith(namespace)) {
                keys.push(raw.slice(namespace.length));
            }
        }

        return keys;
    };

    return {
        async getJson<T>(key: string): Promise<T | null> {
            assertStorageKey(key);
            const raw = webStorage.getItem(physicalKey(key));
            return raw === null ? null : parseStoredJson<T>(key, raw);
        },

        async setJson<T>(key: string, value: T): Promise<void> {
            assertStorageKey(key);
            webStorage.setItem(physicalKey(key), serializeJson(key, value));
        },

        async remove(key: string): Promise<void> {
            assertStorageKey(key);
            webStorage.removeItem(physicalKey(key));
        },

        async listKeys(prefix: string): Promise<string[]> {
            return logicalKeys().filter(key => key.startsWith(prefix));
        },

        async clear(prefix?: string): Promise<void> {
            for (const key of logicalKeys()) {
                if (prefix === undefined || key.startsWith(prefix)) {
                    webStorage.removeItem(physicalKey(key));
                }
            }
        },
    };
};
