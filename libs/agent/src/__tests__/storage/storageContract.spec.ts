import { describe, expect, it } from 'vitest';

import { createBrowserAgentStorage } from '../../storage/BrowserAgentStorage';
import { createMemoryAgentStorage } from '../../storage/MemoryAgentStorage';

import type { WebStorageLike } from '../../storage/BrowserAgentStorage';
import type { AgentStorage } from '../../storage/types';

/**
 * The shared storage contract: one set of expectations executed against BOTH
 * implementations. This is the proof behind "same interface, same semantics" — memory
 * (node-virtual) and localStorage-backed (browser) storage must be indistinguishable
 * through AgentStorage.
 */
interface StorageContractHarness {
    create(): AgentStorage;
    /** Plant a raw non-JSON value behind the interface, as real storage corruption would. */
    createWithCorruptEntry(key: string, raw: string): AgentStorage;
}

const createFakeWebStorage = (): WebStorageLike => {
    const values = new Map<string, string>();

    return {
        get length() {
            return values.size;
        },
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => void values.set(key, value),
        removeItem: key => void values.delete(key),
        key: index => [...values.keys()][index] ?? null,
    };
};

const memoryHarness: StorageContractHarness = {
    create: () => createMemoryAgentStorage(),
    createWithCorruptEntry: (key, raw) => createMemoryAgentStorage({ seed: { [key]: raw } }),
};

const browserHarness: StorageContractHarness = {
    create: () => createBrowserAgentStorage({ webStorage: createFakeWebStorage() }),
    createWithCorruptEntry: (key, raw) => {
        const webStorage = createFakeWebStorage();
        webStorage.setItem(`flow_mosaic_agent_${key}`, raw);
        return createBrowserAgentStorage({ webStorage });
    },
};

describe.each<[string, StorageContractHarness]>([
    ['MemoryAgentStorage (node-virtual)', memoryHarness],
    ['BrowserAgentStorage (browser)', browserHarness],
])('storage contract — %s', (_name, harness) => {
    it('round-trips JSON values', async () => {
        const storage = harness.create();

        await storage.setJson('object', { nested: { ok: true }, list: [1, 2] });
        await storage.setJson('number', 7);
        await storage.setJson('null', null);

        await expect(storage.getJson('object')).resolves.toEqual({ nested: { ok: true }, list: [1, 2] });
        await expect(storage.getJson('number')).resolves.toBe(7);
        await expect(storage.getJson('null')).resolves.toBeNull();
    });

    it('resolves null for an absent key', async () => {
        await expect(harness.create().getJson('absent')).resolves.toBeNull();
    });

    it('removes a key', async () => {
        const storage = harness.create();

        await storage.setJson('gone', 'soon');
        await storage.remove('gone');

        await expect(storage.getJson('gone')).resolves.toBeNull();
    });

    it('lists keys by prefix', async () => {
        const storage = harness.create();

        await storage.setJson('session:a', 1);
        await storage.setJson('session:b', 2);
        await storage.setJson('config', 3);

        await expect(storage.listKeys('session:')).resolves.toEqual(['session:a', 'session:b']);
        await expect(storage.listKeys('')).resolves.toHaveLength(3);
    });

    it('clear(prefix) removes only matching keys; clear() removes everything', async () => {
        const storage = harness.create();

        await storage.setJson('session:a', 1);
        await storage.setJson('config', 2);

        await storage.clear?.('session:');
        await expect(storage.listKeys('')).resolves.toEqual(['config']);

        await storage.clear?.();
        await expect(storage.listKeys('')).resolves.toEqual([]);
    });

    it('rejects corrupt stored JSON with the offending key in the message', async () => {
        const storage = harness.createWithCorruptEntry('corrupt', '{not json');

        await expect(storage.getJson('corrupt')).rejects.toThrow(/key "corrupt" is not valid JSON/);
    });
});
