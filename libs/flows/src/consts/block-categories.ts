import { Eye, FileInput, RefreshCw } from 'lucide-react';

export const BLOCK_CATEGORY_CONFIG = {
    inputs: { icon: FileInput, label: 'sidebar.inputs', color: 'text-primary' },
    process: { icon: RefreshCw, label: 'sidebar.process', color: 'text-muted-foreground' },
    outputs: { icon: Eye, label: 'sidebar.output', color: 'text-success' },
} as const;

export const BLOCK_CATEGORIES = Object.keys(BLOCK_CATEGORY_CONFIG) as Array<keyof typeof BLOCK_CATEGORY_CONFIG>;

export type BlockCategoryKey = keyof typeof BLOCK_CATEGORY_CONFIG;
