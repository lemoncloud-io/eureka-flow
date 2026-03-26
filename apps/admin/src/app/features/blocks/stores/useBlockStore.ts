import { create } from 'zustand';

import { MOCK_BLOCKS } from '../consts';

import type { Block, BlockFormData } from '../types';

interface BlockState {
    blocks: Block[];
    addBlock: (data: BlockFormData) => Block;
    updateBlock: (id: string, updates: Partial<BlockFormData>) => void;
    deleteBlock: (id: string) => void;
}

export const useBlockStore = create<BlockState>()((set, get) => ({
    blocks: [...MOCK_BLOCKS],
    addBlock: (data: BlockFormData) => {
        const { blocks } = get();
        const maxId = Math.max(...blocks.map(b => parseInt(b.id, 10)), 0);
        const now = Date.now();
        const newBlock: Block = {
            ...data,
            id: String(maxId + 1).padStart(4, '0'),
            createdAt: now,
            updatedAt: now,
            deletedAt: 0,
        };
        set(state => ({ blocks: [...state.blocks, newBlock] }));
        return newBlock;
    },
    updateBlock: (id: string, updates: Partial<BlockFormData>) => {
        set(state => ({
            blocks: state.blocks.map(block =>
                block.id === id ? { ...block, ...updates, updatedAt: Date.now() } : block
            ),
        }));
    },
    deleteBlock: (id: string) => {
        set(state => ({ blocks: state.blocks.filter(block => block.id !== id) }));
    },
}));
