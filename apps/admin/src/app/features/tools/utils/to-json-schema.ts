import type { ToolParameter } from '../types';

interface JsonSchemaProperty {
    type: string;
    description?: string;
    enum?: string[];
    default?: string | number | boolean;
    items?: JsonSchemaProperty;
    properties?: Record<string, JsonSchemaProperty>;
    required?: string[];
    additionalProperties?: boolean;
}

export interface JsonSchema {
    type: 'object';
    properties: Record<string, JsonSchemaProperty>;
    required: string[];
    additionalProperties: boolean;
}

const buildProperty = (param: ToolParameter): JsonSchemaProperty => {
    const prop: JsonSchemaProperty = {
        type: param.type,
        description: param.description || undefined,
    };

    if (param.enum && param.enum.length > 0) {
        prop.enum = param.enum;
    }

    if (param.defaultValue !== undefined && param.defaultValue !== '') {
        prop.default = parseDefault(param.defaultValue, param.type);
    }

    if (param.type === 'array' && param.items) {
        prop.items = { type: param.items.type };
    }

    if (param.type === 'object' && param.properties && param.properties.length > 0) {
        const nested = toJsonSchema(param.properties);
        prop.properties = nested.properties;
        prop.required = nested.required;
        prop.additionalProperties = false;
    }

    return prop;
};

const parseDefault = (value: string, type: string): string | number | boolean => {
    if (type === 'number') return Number(value) || 0;
    if (type === 'boolean') return value === 'true';
    return value;
};

export const toJsonSchema = (parameters: ToolParameter[]): JsonSchema => {
    const properties: Record<string, JsonSchemaProperty> = {};
    const required: string[] = [];

    for (const param of parameters) {
        if (!param.name.trim()) continue;
        properties[param.name] = buildProperty(param);
        if (param.required) {
            required.push(param.name);
        }
    }

    return {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
    };
};
