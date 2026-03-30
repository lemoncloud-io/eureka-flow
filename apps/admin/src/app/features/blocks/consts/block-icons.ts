import { Brain, Bug, Clock, Cog, FileCode, FileUp, Image, Puzzle, Search, Type } from 'lucide-react';

import type { LucideIcon } from 'lucide-react';

const PROCESS_TYPE_ICON_MAP: Record<string, LucideIcon> = {
    'input-text': Type,
    'input-image': Image,
    'upload-html': FileUp,
    buffer: Clock,
    'single-output-generator': Brain,
    'single-image-generator': Image,
    'schema-json-converter': Puzzle,
    'mustache-text-generator': FileCode,
    'output-preview': Search,
    'output-console': Bug,
};

export const getBlockIcon = (processType: string): LucideIcon => {
    return PROCESS_TYPE_ICON_MAP[processType] ?? Cog;
};
