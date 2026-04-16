import { useState } from 'react';

const STORAGE_KEY = 'eureka-flow:recent-blocks';
const MAX_RECENT = 5;

interface UseRecentBlocksReturn {
    recentIds: string[];
    addRecent: (blockType: string) => void;
}

export const useRecentBlocks = (): UseRecentBlocksReturn => {
    const [recentIds, setRecentIds] = useState<string[]>(() => {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
        } catch {
            return [];
        }
    });

    const addRecent = (blockType: string) => {
        setRecentIds(prev => {
            const next = [blockType, ...prev.filter(id => id !== blockType)].slice(0, MAX_RECENT);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            return next;
        });
    };

    return { recentIds, addRecent };
};
