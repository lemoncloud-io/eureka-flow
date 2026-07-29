import type { JsonSchema } from '../llm/llmGateway';

/** Minimal JSON-Schema validator; returns human-readable errors (empty = valid). */
export const validateArgs = (schema: JsonSchema, value: unknown, path = ''): string[] => {
    const at = path || 'value';

    if (schema.type === 'object') {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return [`${at} must be an object`];
        }
        const obj = value as Record<string, unknown>;
        const errors: string[] = [];
        for (const key of schema.required ?? []) {
            if (!(key in obj) || obj[key] === undefined) {
                const keyPath = path ? `${path}.${key}` : key;
                errors.push(`${keyPath} is required`);
            }
        }
        for (const [key, propSchema] of Object.entries(schema.properties ?? {})) {
            if (key in obj && obj[key] !== undefined) {
                errors.push(...validateArgs(propSchema, obj[key], path ? `${path}.${key}` : key));
            }
        }
        return errors;
    }

    if (schema.type === 'array') {
        if (!Array.isArray(value)) {
            return [`${at} must be an array`];
        }
        if (!schema.items) {
            return [];
        }
        return value.flatMap((item, i) => validateArgs(schema.items as JsonSchema, item, `${at}[${i}]`));
    }

    if (schema.type === 'string' && typeof value !== 'string') {
        return [`${at} must be a string`];
    }
    if (schema.type === 'number' || schema.type === 'integer') {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            // Reject NaN / ±Infinity — `typeof NaN === 'number'` would otherwise slip through.
            return [`${at} must be a finite number`];
        }
        if (schema.type === 'integer' && !Number.isInteger(value)) {
            return [`${at} must be an integer`];
        }
    }
    if (schema.type === 'boolean' && typeof value !== 'boolean') {
        return [`${at} must be a boolean`];
    }
    if (schema.type === 'null' && value !== null) {
        return [`${at} must be null`];
    }
    if (schema.enum && !schema.enum.includes(value)) {
        return [`${at} must be one of ${JSON.stringify(schema.enum)}`];
    }

    return [];
};
