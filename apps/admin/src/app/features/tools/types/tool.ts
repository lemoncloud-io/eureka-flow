export type ToolCategory = 'file' | 'search' | 'code' | 'web' | 'system' | 'data' | 'custom';

export interface ToolParameter {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    description: string;
    required: boolean;
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
