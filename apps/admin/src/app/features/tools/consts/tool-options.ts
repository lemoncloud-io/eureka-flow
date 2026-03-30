import type { ToolCategory, ToolParameter } from '../types';

export const TOOL_CATEGORY_OPTIONS: { label: string; value: ToolCategory }[] = [
    { label: 'File', value: 'file' },
    { label: 'Search', value: 'search' },
    { label: 'Code', value: 'code' },
    { label: 'Web', value: 'web' },
    { label: 'System', value: 'system' },
    { label: 'Data', value: 'data' },
    { label: 'Custom', value: 'custom' },
];

export const PARAMETER_TYPE_OPTIONS: { label: string; value: ToolParameter['type'] }[] = [
    { label: 'String', value: 'string' },
    { label: 'Number', value: 'number' },
    { label: 'Boolean', value: 'boolean' },
    { label: 'Object', value: 'object' },
    { label: 'Array', value: 'array' },
];
