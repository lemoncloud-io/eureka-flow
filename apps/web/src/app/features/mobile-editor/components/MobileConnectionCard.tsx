import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Check, ChevronDown, ChevronUp, Unlink } from 'lucide-react';

import { useBlockRegistry, useCanvasStore } from '@flows/flows';
import { cn } from '@flows/lib/utils';

import { STEREO_FALLBACK_LABEL, STEREO_ICON_BG } from './consts';
import { BlockIcon } from '../../flows/components/BlockIcon';

import type { NodeData } from '@lemoncloud/eureka-flows-api';

interface MobileConnectionCardProps {
    nodeId: string;
    canEdit: boolean;
    onDisconnect?: () => void;
    onTap?: () => void;
}

export const MobileConnectionCard = ({ nodeId, canEdit, onDisconnect, onTap }: MobileConnectionCardProps) => {
    const { t } = useTranslation(['flows']);
    const [expanded, setExpanded] = useState(false);
    const blockRegistry = useBlockRegistry();

    const node = useCanvasStore(state => state.nodes.find(n => n.id === nodeId));
    const blockDef = node ? blockRegistry[node.type] : undefined;

    const contentPreview = useMemo(() => {
        if (!node) return null;
        const outputData = (node as NodeData & { outputData?: Record<string, { value?: unknown }> }).outputData;
        if (!outputData) return null;
        const entries = Object.entries(outputData);
        if (entries.length === 0) return null;
        const [, data] = entries[0];
        if (typeof data?.value === 'string') return data.value.slice(0, 200);
        return data?.value ? JSON.stringify(data.value).slice(0, 200) : null;
    }, [node]);

    if (!node || !blockDef) return null;

    const stereo = blockDef.stereo ?? 'process';
    const displayName = node.customLabel || blockDef.label || node.type;
    const breadcrumb = `${STEREO_FALLBACK_LABEL[stereo] ?? stereo} · ${blockDef.label ?? node.type}`;

    return (
        <div
            className={cn(
                'rounded-xl border border-success/20 bg-success/[0.03] overflow-hidden',
                'transition-all duration-200'
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
                    <div className="text-[10px] text-muted-foreground/50 truncate">{breadcrumb}</div>
                </div>
                <Check className="w-3.5 h-3.5 text-success/60 shrink-0" />
                {canEdit && onDisconnect && (
                    <button
                        onClick={e => {
                            e.stopPropagation();
                            onDisconnect();
                        }}
                        className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium shrink-0',
                            'bg-primary/5 text-primary/60 border border-primary/15',
                            'hover:bg-primary/10 active:scale-95 transition-all'
                        )}
                    >
                        <Unlink className="w-3 h-3" />
                        <span>{t('mobile.connection.disconnect', '연결 해제')}</span>
                    </button>
                )}
            </div>

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
                            <ChevronUp className="w-4 h-4 text-muted-foreground/40" />
                        ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground/40" />
                        )}
                    </button>
                </>
            )}
        </div>
    );
};
