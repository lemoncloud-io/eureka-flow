import { describe, expect, it } from 'vitest';

import { createMemoryAgentStorage } from '../../storage/MemoryAgentStorage';

describe('createMemoryAgentStorage', () => {
    it('round-trips JSON values through set/get', async () => {
        const storage = createMemoryAgentStorage();

        await storage.setJson('session', { messages: ['hello'], turn: 2 });
        await storage.setJson('count', 42);
        await storage.setJson('flag', false);
        await storage.setJson('nothing', null);

        await expect(storage.getJson('session')).resolves.toEqual({ messages: ['hello'], turn: 2 });
        await expect(storage.getJson('count')).resolves.toBe(42);
        await expect(storage.getJson('flag')).resolves.toBe(false);
        await expect(storage.getJson('nothing')).resolves.toBeNull();
    });

    it('resolves null for an absent key', async () => {
        const storage = createMemoryAgentStorage();

        await expect(storage.getJson('missing')).resolves.toBeNull();
    });

    it('removes a key', async () => {
        const storage = createMemoryAgentStorage();

        await storage.setJson('gone', 'soon');
        await storage.remove('gone');

        await expect(storage.getJson('gone')).resolves.toBeNull();
    });

    it('lists keys by prefix', async () => {
        const storage = createMemoryAgentStorage();

        await storage.setJson('session:a', 1);
        await storage.setJson('session:b', 2);
        await storage.setJson('config', 3);

        await expect(storage.listKeys('session:')).resolves.toEqual(['session:a', 'session:b']);
        await expect(storage.listKeys('')).resolves.toHaveLength(3);
    });

    it('clear(prefix) removes only matching keys; clear() removes everything', async () => {
        const storage = createMemoryAgentStorage();

        await storage.setJson('session:a', 1);
        await storage.setJson('config', 2);

        await storage.clear('session:');
        await expect(storage.listKeys('')).resolves.toEqual(['config']);

        await storage.clear();
        await expect(storage.listKeys('')).resolves.toEqual([]);
    });

    it('rejects with the offending key when a stored value is corrupt JSON', async () => {
        const storage = createMemoryAgentStorage({ seed: { corrupt: '{not json' } });

        await expect(storage.getJson('corrupt')).rejects.toThrow(/key "corrupt" is not valid JSON/);
    });

    it('rejects when a value cannot be serialized (circular reference)', async () => {
        const storage = createMemoryAgentStorage();
        const circular: Record<string, unknown> = {};
        circular['self'] = circular;

        await expect(storage.setJson('bad', circular)).rejects.toThrow(/key "bad" cannot be serialized/);
    });

    it('rejects non-string keys', async () => {
        const storage = createMemoryAgentStorage();

        await expect(storage.getJson(1 as unknown as string)).rejects.toThrow(/must be non-empty strings/);
        await expect(storage.setJson('' as string, 1)).rejects.toThrow(/must be non-empty strings/);
    });
});
