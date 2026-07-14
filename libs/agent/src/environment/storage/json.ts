/**
 * Shared helpers for the storage implementations: string-only key guard and JSON
 * (de)serialization that fails loudly with the offending key in the message.
 */

export const assertStorageKey = (key: unknown): string => {
    if (typeof key !== 'string' || key.length === 0) {
        throw new TypeError(`Storage keys must be non-empty strings, got: ${typeof key}`);
    }

    return key;
};

export const parseStoredJson = <T>(key: string, raw: string): T => {
    try {
        return JSON.parse(raw) as T;
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`Stored value for key "${key}" is not valid JSON (storage may be corrupted): ${detail}`);
    }
};

export const serializeJson = (key: string, value: unknown): string => {
    let raw: string | undefined;

    try {
        raw = JSON.stringify(value);
    } catch (err) {
        // e.g. circular references
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`Value for key "${key}" cannot be serialized to JSON: ${detail}`);
    }

    if (raw === undefined) {
        // JSON.stringify(undefined) and functions/symbols produce undefined, not a string.
        throw new Error(`Value for key "${key}" cannot be serialized to JSON (got undefined)`);
    }

    return raw;
};
