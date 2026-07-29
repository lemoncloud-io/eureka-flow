import React, { useEffect, useRef } from 'react';

import { cn } from '@flows/lib/utils';

import { STAGE_STYLES, getTraceDetail } from './helpers';

import type { TraceEntry, TraceStage } from '@flows/flows';

export const AgentTraceVisualization: React.FC<{ traceLogs: TraceEntry[]; contentHeight?: number }> = ({
    traceLogs,
    contentHeight,
}) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const maxH = contentHeight ?? 160;

    // Auto-scroll to bottom on new entries
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [traceLogs.length]);

    return (
        <div
            ref={scrollRef}
            className="p-2 bg-muted/10 rounded-lg border border-border/30 overflow-y-auto font-mono text-[10px] leading-relaxed"
            style={{ maxHeight: `${maxH}px`, minHeight: contentHeight ? `${contentHeight}px` : '80px' }}
            onWheel={e => e.stopPropagation()}
        >
            {traceLogs.map((entry, i) => {
                const stage = entry.stage as TraceStage | undefined;
                const style = (stage && STAGE_STYLES[stage as keyof typeof STAGE_STYLES]) ?? STAGE_STYLES.trace;
                const detail = getTraceDetail(entry);
                return (
                    <div key={`${entry.seq}-${i}`} className="flex gap-1.5 py-0.5">
                        <span className={cn('shrink-0 font-semibold min-w-[4rem] text-right', style.color)}>
                            {style.label}
                        </span>
                        <span className="text-foreground/70 break-words whitespace-pre-wrap">
                            {entry.message ?? ''}
                            {detail && <span className="text-muted-foreground/50">{` · ${detail}`}</span>}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};
