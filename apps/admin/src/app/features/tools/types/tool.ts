export type ToolCategory = 'file' | 'search' | 'code' | 'web' | 'system' | 'data' | 'custom';

export type ParameterType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface ToolParameter {
    name: string;
    type: ParameterType;
    description: string;
    required: boolean;
    enum?: string[];
    defaultValue?: string;
    /** For array type: schema of each item */
    items?: { type: ParameterType };
    /** For object type: nested properties */
    properties?: ToolParameter[];
}

export interface Tool {
    id: string;
    createdAt: number;
    updatedAt: number;
    deletedAt: number;
    name: string;
    label: string;
    icon: string;
    category: ToolCategory;
    description: string;
    parameters: ToolParameter[];
    isEnabled: boolean;
}

export type ToolFormData = Omit<Tool, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
