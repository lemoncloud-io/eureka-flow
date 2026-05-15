import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertTriangle, Loader2, Maximize2, MoreVertical, Play, Trash2 } from 'lucide-react';

import { getPermissions, isAiBlock, isMissingAiKey, useBlockRegistry } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@flows/ui-kit';
import { useWebCoreStore } from '@flows/web-core';

import { STEREO_FALLBACK_LABEL, STEREO_ICON_BG } from './consts';
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
        const { canEdit, canRun } = useMemo(() => getPermissions(role), [role]);
        const blockDef = blockRegistry[node.type];
        const state = (node.state ?? 'IDLE') as NodeState;
        const stereo = blockDef?.stereo ?? 'process';
        const isRunning = state === 'RUNNING';

        const hasGeminiKey = useWebCoreStore(s => s.hasGeminiKey);
        const hasOpenaiKey = useWebCoreStore(s => s.hasOpenaiKey);
        const needsAiKey = useMemo(
            () =>
                !!blockDef &&
                isAiBlock(blockDef.type) &&
                isMissingAiKey(node.config?.model as string | undefined, hasGeminiKey, hasOpenaiKey),
            [blockDef, node.config?.model, hasGeminiKey, hasOpenaiKey]
        );

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

        const outputPreview = useMemo(() => {
            if (!node.outputData) return null;
            const entries = Object.entries(node.outputData);
            if (entries.length === 0) return null;
            const [, data] = entries[0];
            if (data?.type === 'image') return { type: 'image' as const, value: t('mobile.imageOutput', 'Image') };
            const val = typeof data?.value === 'string' ? data.value : JSON.stringify(data?.value);
            return val ? { type: 'text' as const, value: val.slice(0, 300) } : null;
        }, [node.outputData, t]);

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

        const borderColor = isRunning
            ? 'border-warning/30'
            : state === 'ERROR'
              ? 'border-destructive/30'
              : state === 'COMPLETED'
                ? 'border-success/30'
                : 'border-border/40';

        return (
            <button
                type="button"
                data-node-id={node.id}
                onClick={() => onTapCard(node.id)}
                className={cn(
                    'w-full rounded-xl border bg-card text-left',
                    'active:scale-[0.98] transition-all duration-150',
                    'hover:shadow-sm overflow-hidden',
                    borderColor
                )}
            >
                {/* Header row: icon + status dot + menu */}
                <div className="flex items-center gap-2 px-3 pt-3 pb-1">
                    <div
                        className={cn(
                            'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                            STEREO_ICON_BG[stereo] ?? 'bg-muted/50'
                        )}
                    >
                        <BlockIcon icon={blockDef?.icon} size={18} />
                    </div>
                    <div className="flex-1" />

                    {/* AI Key Warning */}
                    {needsAiKey && <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />}

                    {/* Status dot */}
                    {isRunning ? (
                        <Loader2 className="w-4 h-4 text-warning animate-spin shrink-0" />
                    ) : (
                        <div className={cn('w-2 h-2 rounded-full transition-colors shrink-0', dotColor)} />
                    )}

                    {/* Overflow menu */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={e => e.stopPropagation()}
                                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 hover:bg-accent/50 transition-colors"
                            >
                                <MoreVertical className="w-4 h-4 text-muted-foreground" />
                            </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                            {canRun && blockDef?.isRunnable !== false && onRun && (
                                <DropdownMenuItem onClick={handleRun} disabled={isRunning} className="gap-2">
                                    <Play className="w-3.5 h-3.5" />
                                    {t('mobile.run', 'Run')}
                                </DropdownMenuItem>
                            )}
                            {canEdit && onDelete && (
                                <DropdownMenuItem onClick={handleDelete} className="gap-2 text-destructive">
                                    <Trash2 className="w-3.5 h-3.5" />
                                    {t('mobile.delete', 'Delete')}
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                {/* Node name + breadcrumb */}
                <div className="px-3 pb-2">
                    <div className="text-base font-bold truncate leading-tight">{displayName}</div>
                    <div className="text-xs text-muted-foreground/50 mt-0.5">
                        {STEREO_FALLBACK_LABEL[stereo] ?? stereo} · {blockDef?.label ?? node.type}
                    </div>
                </div>

                {/* Output content preview box */}
                {outputPreview && state === 'COMPLETED' && (
                    <div className="px-3 pb-3">
                        <div className="relative rounded-lg bg-muted/20 border border-border/30 p-3">
                            <div className="text-xs text-muted-foreground leading-relaxed line-clamp-3 pr-6">
                                {outputPreview.value}
                            </div>
                            <Maximize2 className="absolute bottom-2 right-2 w-3.5 h-3.5 text-muted-foreground/30" />
                        </div>
                    </div>
                )}

                {/* Error banner */}
                {state === 'ERROR' && 'error' in node && typeof node.error === 'string' && node.error && (
                    <div className="mx-3 mb-3 rounded-lg bg-destructive/5 border border-destructive/20 px-3 py-2">
                        <div className="text-xs text-destructive font-medium">{t('mobile.state.error', '오류')}:</div>
                        <div className="text-[11px] text-destructive/70 line-clamp-2 mt-0.5">{node.error}</div>
                    </div>
                )}
            </button>
        );
    }
);

MobileStepCard.displayName = 'MobileStepCard';
