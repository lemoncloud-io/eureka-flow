import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Loader2, MoreVertical, Play, Trash2 } from 'lucide-react';

import { useBlockRegistry } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@flows/ui-kit';

import { STATE_STYLES, STEREO_ICON_BG } from './consts';
import { BlockIcon } from '../../flows/components/BlockIcon';

import type { FlowRole } from '@flows/flows';
import type { NodeData, NodeState } from '@lemoncloud/eureka-flows-api';

interface MobileStepCardProps {
    node: NodeData;
    displayName: string;
    onTapCard: (nodeId: string) => void;
    onRun?: (nodeId: string) => void;
    onDelete?: (nodeId: string) => void;
    role?: FlowRole;
}

export const MobileStepCard = React.memo(
    ({ node, displayName, onTapCard, onRun, onDelete, role = 'owner' }: MobileStepCardProps) => {
        const { t } = useTranslation(['flows']);
        const blockRegistry = useBlockRegistry();
        const blockDef = blockRegistry[node.type];
        const state = (node.state ?? 'IDLE') as NodeState;
        const stateStyle = STATE_STYLES[state] ?? STATE_STYLES.IDLE;
        const stereo = blockDef?.stereo ?? 'process';
        const isRunning = state === 'RUNNING';

        const handleRun = useCallback(
            (e: React.MouseEvent) => {
                e.stopPropagation();
                onRun?.(node.id);
            },
            [node.id, onRun]
        );

        const handleDelete = useCallback(
            (e: React.MouseEvent) => {
                e.stopPropagation();
                if (onDelete && window.confirm(t('mobile.deleteStep', 'Delete this step?'))) {
                    onDelete(node.id);
                }
            },
            [node.id, onDelete]
        );

        const outputSubtitle = useMemo(() => {
            if (state !== 'COMPLETED' || !node.outputData) return null;
            const entries = Object.entries(node.outputData);
            if (entries.length === 0) return null;
            const [, data] = entries[0];
            if (data?.type === 'image') return t('mobile.imageOutput', 'Image');
            const val =
                typeof data?.value === 'string' ? data.value.slice(0, 40) : JSON.stringify(data?.value)?.slice(0, 40);
            return val || null;
        }, [state, node.outputData, t]);

        const dotColor =
            state === 'RUNNING'
                ? 'bg-warning'
                : state === 'COMPLETED'
                  ? 'bg-success'
                  : state === 'ERROR'
                    ? 'bg-destructive'
                    : state === 'READY'
                      ? 'bg-primary'
                      : 'bg-muted-foreground/25';

        return (
            <button
                type="button"
                data-node-id={node.id}
                onClick={() => onTapCard(node.id)}
                className={cn(
                    'w-full flex items-center gap-3 px-4 py-3.5 min-h-[56px]',
                    'rounded-xl border bg-card text-left',
                    'active:scale-[0.98] transition-all duration-150',
                    'hover:shadow-sm',
                    isRunning && 'border-warning/30',
                    state === 'ERROR' && 'border-destructive/20',
                    state === 'COMPLETED' && 'border-success/20',
                    state !== 'RUNNING' && state !== 'ERROR' && state !== 'COMPLETED' && 'border-border/60'
                )}
            >
                {/* Icon */}
                <div
                    className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                        STEREO_ICON_BG[stereo] ?? 'bg-muted/50'
                    )}
                >
                    <BlockIcon icon={blockDef?.icon} size={18} />
                </div>

                {/* Node name + subtitle */}
                <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate leading-tight">{displayName}</div>
                    {state === 'ERROR' && 'error' in node && typeof node.error === 'string' && node.error ? (
                        <div className="text-[11px] text-destructive/70 truncate mt-0.5">{node.error}</div>
                    ) : outputSubtitle ? (
                        <div className="text-[11px] text-success/50 truncate mt-0.5">{outputSubtitle}</div>
                    ) : null}
                </div>

                {/* Status dot */}
                <div className="flex items-center gap-1 shrink-0">
                    {isRunning ? (
                        <Loader2 className="w-4 h-4 text-warning animate-spin" />
                    ) : (
                        <div
                            className={cn('w-2 h-2 rounded-full transition-colors', dotColor)}
                            aria-label={`Status: ${stateStyle.label}`}
                        />
                    )}
                </div>

                {/* More menu */}
                {role === 'owner' && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={e => e.stopPropagation()}
                                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 hover:bg-accent/50 transition-colors"
                            >
                                <MoreVertical className="w-4 h-4 text-muted-foreground" />
                            </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                            {blockDef?.isRunnable !== false && onRun && (
                                <DropdownMenuItem onClick={handleRun} disabled={isRunning} className="gap-2">
                                    <Play className="w-3.5 h-3.5" />
                                    {t('mobile.run', 'Run')}
                                </DropdownMenuItem>
                            )}
                            {onDelete && (
                                <DropdownMenuItem onClick={handleDelete} className="gap-2 text-destructive">
                                    <Trash2 className="w-3.5 h-3.5" />
                                    {t('mobile.delete', 'Delete')}
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </button>
        );
    }
);

MobileStepCard.displayName = 'MobileStepCard';
