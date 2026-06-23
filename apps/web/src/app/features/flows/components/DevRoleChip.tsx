import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

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
    onClose?: () => void;
}

export const DevRoleChip = ({ role, computedRole, onOverride, onClose }: DevRoleChipProps) => {
    const { t } = useTranslation(['flows']);
    const dragRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ x: 16, y: 88 });
    const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
    const didDrag = useRef(false);

    const handlePointerDown = useCallback(
        (e: React.PointerEvent) => {
            if ((e.target as HTMLElement).closest('button')) return;
            e.preventDefault();
            dragState.current = { startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y };
            didDrag.current = false;
            dragRef.current?.setPointerCapture(e.pointerId);
        },
        [pos]
    );

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragState.current) return;
        const dx = dragState.current.startX - e.clientX;
        const dy = dragState.current.startY - e.clientY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag.current = true;
        setPos({
            x: Math.max(0, dragState.current.originX + dx),
            y: Math.max(0, dragState.current.originY + dy),
        });
    }, []);

    const handlePointerUp = useCallback(() => {
        dragState.current = null;
        requestAnimationFrame(() => {
            didDrag.current = false;
        });
    }, []);

    return (
        <TooltipProvider delayDuration={300}>
            <div
                ref={dragRef}
                className="fixed z-50 touch-none"
                style={{ right: pos.x, bottom: pos.y }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
            >
                <div className="flex gap-1 bg-glass-bg backdrop-blur-2xl border border-border/40 shadow-floating rounded-2xl p-1 text-xs font-mono cursor-grab active:cursor-grabbing">
                    <span className="px-1.5 py-1 text-muted-foreground/50 select-none text-[10px] font-semibold">
                        {t('devRoleChip.label')}
                    </span>
                    {DEV_ROLES.map(r => {
                        const p = getPermissions(r);
                        const tooltip = [
                            `${t('devRoleChip.canvas')}: ${p.canModifyCanvas ? '●' : '✗'}`,
                            `${t('devRoleChip.config')}: ${p.canEditConfig ? '●' : '✗'}`,
                            `${t('devRoleChip.run')}: ${p.canRun ? '●' : '✗'}`,
                            `${t('devRoleChip.metadata')}: ${p.canEditStructure ? '●' : '✗'}`,
                        ].join(' · ');
                        return (
                            <Tooltip key={r}>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={() => {
                                            if (didDrag.current) return;
                                            onOverride(r === computedRole ? null : r);
                                        }}
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
                                <TooltipContent side="top" className="text-[10px]">
                                    {tooltip}
                                </TooltipContent>
                            </Tooltip>
                        );
                    })}
                    {onClose && (
                        <button
                            onClick={() => {
                                if (didDrag.current) return;
                                onClose();
                            }}
                            className="px-1.5 py-1 rounded-lg text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="Exit debug mode"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    )}
                </div>
            </div>
        </TooltipProvider>
    );
};
