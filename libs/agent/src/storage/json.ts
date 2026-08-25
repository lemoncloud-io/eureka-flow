import { errorMessage } from '../utils/errors';

/** Shared storage helpers: key guard and JSON (de)serialization that fails loudly with the key. */

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
        throw new Error(
            `Stored value for key "${key}" is not valid JSON (storage may be corrupted): ${errorMessage(err)}`
        );
    }
};

export const serializeJson = (key: string, value: unknown): string => {
    let raw: string | undefined;

    try {
        raw = JSON.stringify(value);
    } catch (err) {
        // e.g. circular references
        throw new Error(`Value for key "${key}" cannot be serialized to JSON: ${errorMessage(err)}`);
    }

    if (raw === undefined) {
        // JSON.stringify(undefined) and functions/symbols produce undefined, not a string.
        throw new Error(`Value for key "${key}" cannot be serialized to JSON (got undefined)`);
    }

    return raw;
};
