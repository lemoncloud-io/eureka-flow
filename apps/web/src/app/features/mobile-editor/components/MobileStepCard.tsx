import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertTriangle, Loader2, Maximize2, MoreVertical, Play, Trash2 } from 'lucide-react';

import { getPermissions, isAiBlock, isMissingAiKey, translateField, useBlockRegistry, useS3Image } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@flows/ui-kit';
import { useWebCoreStore } from '@flows/web-core';

import { STEREO_FALLBACK_LABEL, STEREO_ICON_BG } from './consts';
import { BlockIcon } from '../../flows/components/BlockIcon';

import type { FlowRole, GraphNode, NodeState } from '@flows/flows';

interface ContentPreviewData {
    type: 'text' | 'image' | 'waiting';
    value: string;
}

/** Extract displayable content from port data (outputData/inputData) */
const extractPortContent = (portData: Record<string, unknown> | undefined): ContentPreviewData | null => {
    if (!portData) return null;
    for (const data of Object.values(portData)) {
        const d = data as { value?: unknown; type?: string } | null;
        if (!d) continue;
        if (d.type === 'image' && d.value) return { type: 'image', value: String(d.value) };
        if (d.value != null) {
            const val = typeof d.value === 'string' ? d.value : JSON.stringify(d.value);
            if (val && val !== 'null') return { type: 'text', value: val.slice(0, 300) };
        }
    }
    return null;
};

/** Inline image thumbnail for card preview */
const CardImagePreview = ({ src }: { src: string }) => {
    const { src: resolvedSrc } = useS3Image(src);
    const [dims, setDims] = useState<string | null>(null);
    return (
        <div className="relative w-full h-40 rounded-lg bg-black/5 dark:bg-white/5 overflow-hidden flex items-center justify-center">
            {resolvedSrc ? (
                <img
                    src={resolvedSrc}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                    onLoad={e => setDims(`${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`)}
                />
            ) : (
                <div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-spin" />
            )}
            <div className="absolute bottom-1.5 right-1.5 flex gap-1">
                {dims && (
                    <span className="bg-black/70 text-[9px] px-1.5 py-0.5 rounded text-white/90 backdrop-blur-sm font-mono">
                        {dims}
                    </span>
                )}
                <span className="bg-purple-500/80 text-[9px] px-1.5 py-0.5 rounded text-white font-semibold backdrop-blur-sm">
                    IMG
                </span>
            </div>
        </div>
    );
};

interface MobileStepCardProps {
    node: GraphNode;
    displayName: string;
    onTapCard: (nodeId: string) => void;
    onExpandContent?: (content: { value: unknown; type?: string }) => void;
    onRun?: (nodeId: string) => void;
    onDelete?: (nodeId: string) => void;
    role?: FlowRole;
}

export const MobileStepCard = React.memo(
    ({ node, displayName, onTapCard, onExpandContent, onRun, onDelete, role = 'owner' }: MobileStepCardProps) => {
        const { t } = useTranslation(['flows', 'blocks']);
        const blockRegistry = useBlockRegistry();
        const { canEditStructure, canRun } = useMemo(() => getPermissions(role), [role]);
        const blockDef = blockRegistry[node.type];
        const state = (node.state ?? 'IDLE') as NodeState;
        const stereo = blockDef?.stereo ?? 'process';
        const isRunning = state === 'RUNNING';
        const blockType = blockDef?.type ?? node.type;

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

        const [confirmingDelete, setConfirmingDelete] = useState(false);
        const handleDeleteSelect = useCallback(
            (e: Event) => {
                if (!confirmingDelete) {
                    // Keep the dropdown open so the user can tap once more to confirm.
                    e.preventDefault();
                    setConfirmingDelete(true);
                    setTimeout(() => setConfirmingDelete(false), 3000);
                    return;
                }
                onDelete?.(node.id);
                setConfirmingDelete(false);
            },
            [node.id, onDelete, confirmingDelete]
        );

        const contentPreview = useMemo((): ContentPreviewData | null => {
            // 1. Output data
            const outputContent = extractPortContent(node.outputData as Record<string, unknown> | undefined);
            if (outputContent) return outputContent;

            // 2. Input data
            const inputContent = extractPortContent(node.inputData as Record<string, unknown> | undefined);
            if (inputContent) return inputContent;

            // 3. Config-based content
            if (blockType === 'input-text') {
                const text = node.config?.text as string | undefined;
                if (text) return { type: 'text', value: text.slice(0, 300) };
            }
            if (blockType === 'input-image') {
                const img = node.config?.imageData as string | undefined;
                if (img) return { type: 'image', value: img };
            }

            // 4. Process block config preview (system prompt, etc.)
            const system = node.config?.system as string | undefined;
            if (system) return { type: 'text', value: system.slice(0, 300) };

            // 5. Output blocks waiting state
            if (stereo === 'output') return { type: 'waiting', value: t('mobile.waitingForData', '데이터 대기 중...') };

            return null;
        }, [node.outputData, node.inputData, node.config, blockType, stereo, t]);

        // Error message — check both error and errorMessage fields
        const errorMessage = useMemo(() => {
            const err =
                (node as GraphNode & { error?: string; errorMessage?: string }).error ||
                (node as GraphNode & { errorMessage?: string }).errorMessage;
            return typeof err === 'string' && err ? err : null;
        }, [node]);

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
            ? 'border-warning/40'
            : state === 'ERROR'
              ? 'border-destructive/40'
              : state === 'COMPLETED'
                ? 'border-success/40'
                : 'border-border';

        return (
            // A div, not a button: the card holds interactive children (expand, menu), and
            // HTML forbids interactive content inside a button — React flags it as a
            // nested-button hydration error.
            <div
                role="button"
                tabIndex={0}
                data-node-id={node.id}
                onClick={() => onTapCard(node.id)}
                onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onTapCard(node.id);
                    }
                }}
                className={cn(
                    'w-full rounded-xl border bg-card text-left cursor-pointer',
                    'transition-colors overflow-hidden',
                    borderColor
                )}
            >
                {/* Header row: icon + status dot + menu */}
                <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
                    <div
                        className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                            STEREO_ICON_BG[stereo] ?? 'bg-muted/50'
                        )}
                    >
                        <BlockIcon icon={blockDef?.icon} size={16} />
                    </div>
                    <div className="flex-1" />

                    {needsAiKey && <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />}

                    {isRunning ? (
                        <Loader2 className="w-4 h-4 text-warning animate-spin shrink-0" />
                    ) : (
                        <div className={cn('w-2 h-2 rounded-full transition-colors shrink-0', dotColor)} />
                    )}

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={e => e.stopPropagation()}
                                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 hover:bg-accent transition-colors"
                            >
                                <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
                            </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40" onClick={e => e.stopPropagation()}>
                            {canRun && blockDef?.isRunnable !== false && onRun && (
                                <DropdownMenuItem onClick={handleRun} disabled={isRunning} className="gap-2">
                                    <Play className="w-3.5 h-3.5" />
                                    {t('mobile.run', 'Run')}
                                </DropdownMenuItem>
                            )}
                            {canEditStructure && onDelete && (
                                <DropdownMenuItem
                                    onSelect={handleDeleteSelect}
                                    className={cn(
                                        'gap-2',
                                        confirmingDelete
                                            ? 'bg-destructive text-destructive-foreground'
                                            : 'text-destructive'
                                    )}
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    {confirmingDelete
                                        ? t('mobile.confirmDelete', '정말 삭제하시겠습니까?')
                                        : t('mobile.delete', 'Delete')}
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                {/* Node name + breadcrumb */}
                <div className="px-3 pb-1.5">
                    <div className="text-sm font-semibold truncate leading-tight">{displayName}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                        {STEREO_FALLBACK_LABEL[stereo] ?? stereo} · {translateField(t, blockDef, 'label') || node.type}
                    </div>
                </div>

                {/* Content preview */}
                {contentPreview && (
                    <div className="px-3 pb-3">
                        {contentPreview.type === 'image' ? (
                            <CardImagePreview src={contentPreview.value} />
                        ) : contentPreview.type === 'waiting' ? (
                            <div className="rounded-lg bg-muted/15 p-3 text-center">
                                <div className="text-xs text-muted-foreground italic">{contentPreview.value}</div>
                            </div>
                        ) : (
                            <div className="relative rounded-lg bg-muted/15 p-2.5">
                                <div className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3 pr-6">
                                    {contentPreview.value}
                                </div>
                                <button
                                    type="button"
                                    onClick={e => {
                                        e.stopPropagation();
                                        onExpandContent?.({ value: contentPreview.value, type: 'text' });
                                    }}
                                    className="absolute -bottom-1 -right-1 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-accent transition-colors"
                                >
                                    <Maximize2 className="w-4 h-4 text-muted-foreground" />
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Error banner */}
                {state === 'ERROR' && errorMessage && (
                    <div className="mx-3 mb-3 rounded-lg bg-destructive/8 px-3 py-2">
                        <div className="text-xs text-destructive font-medium">{t('mobile.state.error', '오류')}:</div>
                        <div className="text-[11px] text-destructive line-clamp-2 mt-0.5">{errorMessage}</div>
                    </div>
                )}
            </div>
        );
    }
);

MobileStepCard.displayName = 'MobileStepCard';
