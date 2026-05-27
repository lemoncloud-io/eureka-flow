import { Plus } from 'lucide-react';

import { cn } from '@flows/lib/utils';

interface AddConnectionRowProps {
    onClick: () => void;
    label: string;
    hint: string;
}

/**
 * Dashed "+ 추가 연결" row shown below a connected port's card group so the user
 * can add another connection to the same port (multi-connection ports only).
 */
export const AddConnectionRow = ({ onClick, label, hint }: AddConnectionRowProps) => (
    <button
        type="button"
        onClick={onClick}
        className={cn(
            'w-full flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs',
            'border border-dashed border-primary/30',
            'text-primary/60 hover:border-primary/50 hover:text-primary/80',
            'transition-colors'
        )}
    >
        <Plus className="w-3 h-3" />
        <span className="font-medium">{label}</span>
        <span className="text-primary/40 ml-1">{hint}</span>
    </button>
);
