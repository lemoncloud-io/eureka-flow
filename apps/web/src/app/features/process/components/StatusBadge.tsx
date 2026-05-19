import { cn } from '@flows/lib/utils';
import { Badge } from '@flows/ui-kit';

import type { Status } from '@flows/flows';

export const STATUS_COLORS: Record<Status, string> = {
    todo: 'text-muted-foreground',
    doing: 'text-blue-500 dark:text-blue-400',
    done: 'text-green-600 dark:text-green-400',
    hold: 'text-orange-500 dark:text-orange-400',
    skip: 'text-muted-foreground/60',
};

export const STATUS_CONFIG: Record<Status, { label: string; className: string }> = {
    todo: { label: 'To Do', className: 'bg-muted text-muted-foreground' },
    doing: { label: 'In Progress', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
    done: { label: 'Done', className: 'bg-green-500/15 text-green-600 dark:text-green-400' },
    hold: { label: 'On Hold', className: 'bg-orange-500/15 text-orange-600 dark:text-orange-400' },
    skip: { label: 'Skipped', className: 'bg-muted/50 text-muted-foreground/60' },
};

interface StatusBadgeProps {
    status: Status;
    className?: string;
}

export const StatusBadge = ({ status, className }: StatusBadgeProps) => {
    const config = STATUS_CONFIG[status];
    return (
        <Badge variant="secondary" className={cn('text-xs font-medium', config.className, className)}>
            {config.label}
        </Badge>
    );
};
