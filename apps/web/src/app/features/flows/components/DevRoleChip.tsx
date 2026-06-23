import { useTranslation } from 'react-i18next';

import { getPermissions } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@flows/ui-kit';

import type { FlowRole } from '@flows/flows';

const DEV_ROLES: FlowRole[] = ['owner', 'editor', 'viewer', 'anonymous'];

const ROLE_SHORT: Record<FlowRole, string> = {
    owner: 'owner',
    editor: 'editor',
    viewer: 'viewer',
    anonymous: 'anon',
};

interface DevRoleChipProps {
    role: FlowRole;
    computedRole: FlowRole;
    onOverride: (role: FlowRole | null) => void;
}

export const DevRoleChip = ({ role, computedRole, onOverride }: DevRoleChipProps) => {
    const { t } = useTranslation(['flows']);

    return (
        <TooltipProvider delayDuration={300}>
            <div
                className={cn(
                    'hidden sm:flex items-center h-9 sm:h-10 px-1 rounded-2xl',
                    'bg-glass-bg backdrop-blur-2xl border border-border/40 shadow-floating',
                    'font-mono text-xs'
                )}
            >
                <span className="px-1.5 py-1 text-[10px] font-semibold text-muted-foreground/50 select-none">
                    {t('devRoleChip.label')}
                </span>
                {DEV_ROLES.map(r => {
                    const p = getPermissions(r);
                    const tooltip = [
                        `${t('devRoleChip.canvas')}: ${p.canModifyCanvas ? '✓' : '✗'}`,
                        `${t('devRoleChip.config')}: ${p.canEditConfig ? '✓' : '✗'}`,
                        `${t('devRoleChip.run')}: ${p.canRun ? '✓' : '✗'}`,
                        `${t('devRoleChip.metadata')}: ${p.canEditStructure ? '✓' : '✗'}`,
                    ].join(' · ');
                    return (
                        <Tooltip key={r}>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={() => onOverride(r === computedRole ? null : r)}
                                    className={cn(
                                        'px-2 py-1 rounded-lg transition-colors',
                                        role === r
                                            ? 'bg-primary text-primary-foreground'
                                            : 'text-muted-foreground hover:bg-accent/60'
                                    )}
                                >
                                    {ROLE_SHORT[r]}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-[10px]">
                                {tooltip}
                            </TooltipContent>
                        </Tooltip>
                    );
                })}
            </div>
        </TooltipProvider>
    );
};
