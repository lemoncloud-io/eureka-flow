import { forwardRef } from 'react';

import { GripVertical } from 'lucide-react';

import { cn } from '@flows/lib/utils';

interface DragHandleProps {
    className?: string;
    listeners?: Record<string, unknown>;
    attributes?: Record<string, unknown>;
}

export const DragHandle = forwardRef<HTMLButtonElement, DragHandleProps>(
    ({ className, listeners, attributes }, ref) => (
        <button
            ref={ref}
            type="button"
            className={cn(
                'min-w-[44px] min-h-[44px] flex items-center justify-center',
                'touch-none cursor-grab active:cursor-grabbing',
                'text-muted-foreground/30 hover:text-muted-foreground/50 transition-colors',
                className
            )}
            {...listeners}
            {...attributes}
        >
            <GripVertical className="w-4 h-4" />
        </button>
    )
);

DragHandle.displayName = 'DragHandle';
