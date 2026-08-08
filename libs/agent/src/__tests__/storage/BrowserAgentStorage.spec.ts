import { describe, expect, it } from 'vitest';

import { createBrowserAgentStorage } from '../../storage/BrowserAgentStorage';

import type { WebStorageLike } from '../../storage/BrowserAgentStorage';

/** Minimal in-memory WebStorageLike so the browser implementation runs without jsdom. */
const createFakeWebStorage = (): WebStorageLike & { dump(): Record<string, string> } => {
    const values = new Map<string, string>();

    return {
        get length() {
            return values.size;
        },
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => void values.set(key, value),
        removeItem: key => void values.delete(key),
        key: index => [...values.keys()][index] ?? null,
        dump: () => Object.fromEntries(values),
    };
};

describe('createBrowserAgentStorage', () => {
    it('namespaces physical keys and round-trips values', async () => {
        const webStorage = createFakeWebStorage();
        const storage = createBrowserAgentStorage({ webStorage });

        await storage.setJson('session', { open: true });

        // Physical key carries the namespace; logical reads do not.
        expect(Object.keys(webStorage.dump())).toEqual(['flow_mosaic_agent_session']);
        await expect(storage.getJson('session')).resolves.toEqual({ open: true });
    });

    it('listKeys returns logical keys (namespace stripped), filtered by prefix', async () => {
        const webStorage = createFakeWebStorage();
        webStorage.setItem('unrelated_app_key', 'x'); // foreign key outside the namespace
        const storage = createBrowserAgentStorage({ webStorage });

        await storage.setJson('session:a', 1);
        await storage.setJson('config', 2);

        await expect(storage.listKeys('')).resolves.toEqual(['session:a', 'config']);
        await expect(storage.listKeys('session:')).resolves.toEqual(['session:a']);
    });

    it('clear() only touches the agent namespace, never foreign app keys', async () => {
        const webStorage = createFakeWebStorage();
        webStorage.setItem('unrelated_app_key', 'precious');
        const storage = createBrowserAgentStorage({ webStorage });

        await storage.setJson('a', 1);
        await storage.setJson('b', 2);
        await storage.clear();

        expect(webStorage.dump()).toEqual({ unrelated_app_key: 'precious' });
    });

    it('clear(prefix) removes only matching logical keys', async () => {
        const webStorage = createFakeWebStorage();
        const storage = createBrowserAgentStorage({ webStorage });

        await storage.setJson('session:a', 1);
        await storage.setJson('config', 2);
        await storage.clear('session:');

        await expect(storage.listKeys('')).resolves.toEqual(['config']);
    });

    it('supports a custom keyPrefix', async () => {
        const webStorage = createFakeWebStorage();
        const storage = createBrowserAgentStorage({ webStorage, keyPrefix: 'custom.' });

        await storage.setJson('k', 'v');

        expect(Object.keys(webStorage.dump())).toEqual(['custom.k']);
    });

    it('rejects with the offending key on corrupt stored JSON', async () => {
        const webStorage = createFakeWebStorage();
        webStorage.setItem('flow_mosaic_agent_corrupt', '{oops');
        const storage = createBrowserAgentStorage({ webStorage });

        await expect(storage.getJson('corrupt')).rejects.toThrow(/key "corrupt" is not valid JSON/);
    });

    it('throws a helpful error when localStorage is unavailable and nothing is injected', () => {
        // Plain node has no globalThis.localStorage.
        expect(() => createBrowserAgentStorage()).toThrow(/localStorage is not available/);
    });
});
