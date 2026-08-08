/** The agent's sanctioned path to persistent state. Keys are strings, values are JSON; JSON errors reject loudly with the offending key. */
export interface AgentStorage {
    /** Read and parse a JSON value; resolves null when the key is absent. Rejects on corrupt JSON. */
    getJson<T>(key: string): Promise<T | null>;
    /** Serialize and store a JSON value. Rejects when the value cannot be serialized. */
    setJson<T>(key: string, value: T): Promise<void>;
    /** Remove a single key (no-op when absent). */
    remove(key: string): Promise<void>;
    /** List stored keys that start with the given prefix ('' lists all). */
    listKeys(prefix: string): Promise<string[]>;
    /** Remove keys matching the prefix, or all of the agent's keys when omitted. */
    clear(prefix?: string): Promise<void>;
}
