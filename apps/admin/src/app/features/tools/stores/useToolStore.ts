import { create } from 'zustand';

import { MOCK_TOOLS } from '../consts';

import type { Tool, ToolFormData } from '../types';

interface ToolState {
    tools: Tool[];
    addTool: (data: ToolFormData) => Tool;
    updateTool: (id: string, updates: Partial<ToolFormData>) => void;
    deleteTool: (id: string) => void;
}

export const useToolStore = create<ToolState>()((set, get) => ({
    tools: [...MOCK_TOOLS],
    addTool: (data: ToolFormData) => {
        const now = Date.now();
        const maxId = Math.max(...get().tools.map(t => parseInt(t.id, 10)), 0);
        const newTool: Tool = {
            ...data,
            id: String(maxId + 1).padStart(4, '0'),
            createdAt: now,
            updatedAt: now,
            deletedAt: 0,
        };
        set(state => ({ tools: [...state.tools, newTool] }));
        return newTool;
    },
    updateTool: (id: string, updates: Partial<ToolFormData>) => {
        set(state => ({
            tools: state.tools.map(tool => (tool.id === id ? { ...tool, ...updates, updatedAt: Date.now() } : tool)),
        }));
    },
    deleteTool: (id: string) => {
        set(state => ({ tools: state.tools.filter(tool => tool.id !== id) }));
    },
}));
