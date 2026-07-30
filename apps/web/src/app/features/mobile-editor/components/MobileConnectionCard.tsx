import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertCircle, Check, ChevronDown, ChevronUp, Unlink } from 'lucide-react';

import { resolveNodeName, translateField, useBlockRegistry, useCanvasStore } from '@flows/flows';
import { cn } from '@flows/lib/utils';

import { STEREO_FALLBACK_LABEL, STEREO_ICON_BG } from './consts';
import { BlockIcon } from '../../flows/components/BlockIcon';
import { useIsConnectionNew } from '../hooks';

import type { GraphNode } from '@flows/flows';

interface MobileConnectionCardProps {
    nodeId: string;
    connectionId: string;
    canEdit: boolean;
    onDisconnect?: () => void;
    onTap?: () => void;
}

export const MobileConnectionCard = ({
    nodeId,
    connectionId,
    canEdit,
    onDisconnect,
    onTap,
}: MobileConnectionCardProps) => {
    const isNew = useIsConnectionNew(connectionId);
    const { t } = useTranslation(['flows', 'blocks']);
    const [expanded, setExpanded] = useState(true);
    const blockRegistry = useBlockRegistry();

    const node = useCanvasStore(state => state.nodes.find(n => n.id === nodeId));
    const blockDef = node ? blockRegistry[node.type] : undefined;

    const contentPreview = useMemo(() => {
        if (!node) return null;
        const outputData = (node as GraphNode & { outputData?: Record<string, { value?: unknown }> }).outputData;
        if (!outputData) return null;
        const entries = Object.entries(outputData);
        if (entries.length === 0) return null;
        const [, data] = entries[0];
        if (typeof data?.value === 'string') return data.value.slice(0, 200);
        return data?.value ? JSON.stringify(data.value).slice(0, 200) : null;
    }, [node]);

    if (!node || !blockDef) return null;

    const stereo = blockDef.stereo ?? 'process';
    const displayName = resolveNodeName(node, blockDef, t);
    const breadcrumb = `${STEREO_FALLBACK_LABEL[stereo] ?? stereo} · ${translateField(t, blockDef, 'label') || node.type}`;
    const nodeState = (node.state ?? 'IDLE') as string;
    const isError = nodeState === 'ERROR';
    const errorMessage =
        (node as GraphNode & { error?: string; errorMessage?: string }).error ||
        (node as GraphNode & { errorMessage?: string }).errorMessage ||
        null;

    return (
        <div
            className={cn(
                'rounded-xl overflow-hidden transition-all duration-200',
                isError
                    ? 'border border-destructive/30 bg-destructive/[0.03]'
                    : 'border border-success/20 bg-success/[0.03]'
            )}
        >
            {/* Header */}
            <div className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer" onClick={onTap}>
                <div
                    className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                        STEREO_ICON_BG[stereo] ?? 'bg-muted/50'
                    )}
                >
                    <BlockIcon icon={blockDef.icon} size={15} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{displayName}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{breadcrumb}</div>
                </div>
                {isError ? (
                    <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                ) : (
                    <div className="flex items-center gap-1 shrink-0">
                        <Check className="w-3.5 h-3.5 text-success" />
                        {isNew && (
                            <span className="text-[9px] font-bold text-success bg-success/10 px-1.5 py-0.5 rounded-full">
                                new
                            </span>
                        )}
                    </div>
                )}
                {canEdit && onDisconnect && (
                    <button
                        onClick={e => {
                            e.stopPropagation();
                            onDisconnect();
                        }}
                        className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium shrink-0',
                            'bg-primary/5 text-primary/60 border border-primary/15',
                            'hover:bg-primary/10 transition-colors'
                        )}
                    >
                        <Unlink className="w-3 h-3" />
                        <span>{t('mobile.connection.disconnect', '연결 해제')}</span>
                    </button>
                )}
            </div>

            {/* Error banner */}
            {isError && errorMessage && (
                <div className="mx-3 mb-1 rounded-lg bg-destructive/5 border border-destructive/15 px-2.5 py-1.5">
                    <div className="text-[10px] text-destructive font-medium">{t('mobile.state.error', '오류')}:</div>
                    <div className="text-[10px] text-destructive/70 line-clamp-2">{errorMessage}</div>
                </div>
            )}

            {/* Content preview (collapsible) */}
            {contentPreview && (
                <>
                    {expanded && (
                        <div className="px-3 pb-2">
                            <div className="rounded-lg bg-muted/20 p-2.5 text-[11px] text-muted-foreground leading-relaxed line-clamp-4">
                                {contentPreview}
                            </div>
                        </div>
                    )}
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="w-full flex justify-center py-1.5 hover:bg-success/5 transition-colors"
                    >
                        {expanded ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                    </button>
                </>
            )}
        </div>
    );
};
