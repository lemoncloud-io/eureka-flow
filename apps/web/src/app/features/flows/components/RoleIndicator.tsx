import { useTranslation } from 'react-i18next';

import { Eye, PenLine } from 'lucide-react';

import { cn } from '@flows/lib/utils';

import type { FlowRole } from '@flows/flows';

interface RoleIndicatorProps {
    role: FlowRole;
    /** Compact variant (mobile flat header): smaller icon. */
    compact?: boolean;
}

/**
 * Lightweight, icon-only role hint (replaces the inline text badge).
 * - Owner: nothing (the default — owners get no marker).
 * - Editor: pencil — can edit config & run, but not restructure.
 * - Viewer / Anonymous: eye — read-only (both lumped; controls already differ by role).
 *
 * Hint surfaced via native `title` (works on touch, matches the prior badge pattern).
 */
export const RoleIndicator = ({ role, compact = false }: RoleIndicatorProps) => {
    const { t } = useTranslation('flows');

    if (role === 'owner') return null;

    const isEditor = role === 'editor';
    const Icon = isEditor ? PenLine : Eye;
    const label = isEditor ? t('header.editorMode', 'Editor') : t('header.viewOnly', 'View Only');
    const title = isEditor
        ? t('header.editorModeHint', 'You can edit settings and run; only the owner can change structure')
        : label;

    return (
        <span
            className={cn(
                'flex shrink-0 items-center justify-center text-muted-foreground',
                compact ? 'h-6 w-6' : 'h-7 w-7'
            )}
            title={title}
            aria-label={label}
        >
            <Icon className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
        </span>
    );
};
