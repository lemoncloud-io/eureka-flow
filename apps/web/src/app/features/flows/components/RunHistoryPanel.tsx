import { memo, useEffect, useMemo, useRef, useState } from 'react';

import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2, XCircle } from 'lucide-react';

import { useNodeRuns } from '@flows/flows';
import { cn } from '@flows/lib/utils';

import type { RunContext, TraceEntry } from '@flows/flows';

interface RunHistoryPanelProps {
    nodeId: string;
    maxHeight?: string;
}

const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
};

const formatRunId = (runId: string): string => runId.slice(-6);

const RunStatusIcon = ({ state }: { state: RunContext['state'] }) => {
    switch (state) {
        case 'RUNNING':
            return <Loader2 className="w-3 h-3 text-cyan-500 animate-spin" />;
        case 'COMPLETED':
            return <CheckCircle2 className="w-3 h-3 text-green-500" />;
        case 'ERROR':
            return <XCircle className="w-3 h-3 text-red-500" />;
        default:
            return null;
    }
};

const ElapsedTimer = ({ startedAt }: { startedAt: number }) => {
    const [elapsed, setElapsed] = useState(() => Date.now() - startedAt);

    useEffect(() => {
        const interval = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
        return () => clearInterval(interval);
    }, [startedAt]);

    return <span className="text-muted-foreground tabular-nums">{formatDuration(elapsed)}</span>;
};

const TraceList = ({ traces }: { traces: TraceEntry[] }) => {
    const sorted = useMemo(() => [...traces].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)), [traces]);

    if (sorted.length === 0) return null;

    return (
        <div className="mt-1.5 ml-5 space-y-0.5">
            {sorted.map((trace, i) => (
                <div key={trace.seq ?? i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                    <span className="text-muted-foreground/50 shrink-0 tabular-nums">#{trace.seq ?? i}</span>
                    {trace.stage && (
                        <span className="shrink-0 text-muted-foreground/70 font-medium">{trace.stage}</span>
                    )}
                    <span className="truncate">{trace.message}</span>
                </div>
            ))}
        </div>
    );
};

const RunRow = memo(({ run, isLatest }: { run: RunContext; isLatest: boolean }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const wasRunning = useRef(false);

    // Auto-expand when run starts (RUNNING state)
    useEffect(() => {
        if (run.state === 'RUNNING' && !wasRunning.current) {
            setIsExpanded(true);
        }
        wasRunning.current = run.state === 'RUNNING';
    }, [run.state]);

    const duration =
        run.state === 'RUNNING' ? null : run.completedAt && run.startedAt ? run.completedAt - run.startedAt : null;

    const hasContent = run.traces.length > 0 || run.error;

    return (
        <div
            className={cn(
                'rounded-md border px-2 py-1.5 transition-colors',
                run.state === 'RUNNING' && 'border-cyan-500/30 bg-cyan-500/5',
                run.state === 'COMPLETED' && 'border-border/50 bg-transparent',
                run.state === 'ERROR' && 'border-red-500/30 bg-red-500/5',
                isLatest && run.state === 'RUNNING' && 'border-cyan-500/50'
            )}
        >
            <button
                className="flex w-full items-center gap-1.5 text-xs"
                onClick={() => hasContent && setIsExpanded(prev => !prev)}
            >
                {hasContent ? (
                    isExpanded ? (
                        <ChevronDown className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                    ) : (
                        <ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                    )
                ) : (
                    <span className="w-3 shrink-0" />
                )}
                <RunStatusIcon state={run.state} />
                <span className="font-mono text-muted-foreground/70">{formatRunId(run.runId)}</span>
                <span
                    className={cn(
                        'font-medium',
                        run.state === 'RUNNING' && 'text-cyan-600 dark:text-cyan-400',
                        run.state === 'COMPLETED' && 'text-green-600 dark:text-green-400',
                        run.state === 'ERROR' && 'text-red-600 dark:text-red-400'
                    )}
                >
                    {run.state}
                </span>
                <span className="ml-auto text-[11px]">
                    {run.state === 'RUNNING' && run.startedAt ? (
                        <ElapsedTimer startedAt={run.startedAt} />
                    ) : duration !== null ? (
                        <span className="text-muted-foreground tabular-nums">{formatDuration(duration)}</span>
                    ) : null}
                </span>
            </button>

            {isExpanded && (
                <div className="mt-1">
                    {run.error && (
                        <div className="flex items-start gap-1.5 px-1 py-1 rounded bg-red-500/10 text-[11px] text-red-600 dark:text-red-400 mb-1">
                            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                            <span className="line-clamp-2">{run.error}</span>
                        </div>
                    )}
                    <TraceList traces={run.traces} />
                </div>
            )}
        </div>
    );
});
RunRow.displayName = 'RunRow';

export const RunHistoryPanel = ({ nodeId, maxHeight = '200px' }: RunHistoryPanelProps) => {
    const runs = useNodeRuns(nodeId);
    const [isOpen, setIsOpen] = useState(false);
    const prevRunCount = useRef(runs.length);

    // Auto-open when a new run starts
    useEffect(() => {
        if (runs.length > prevRunCount.current) {
            setIsOpen(true);
        }
        prevRunCount.current = runs.length;
    }, [runs.length]);

    if (runs.length === 0) return null;

    return (
        <div className="border-t border-border/50">
            <button
                className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setIsOpen(prev => !prev)}
            >
                {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                <span className="font-medium">Runs</span>
                <span className="text-muted-foreground/60">({runs.length})</span>
            </button>

            {isOpen && (
                <div className="px-2 pb-2 space-y-1 overflow-y-auto" style={{ maxHeight }}>
                    {runs.map((run: RunContext, i: number) => (
                        <RunRow key={run.runId} run={run} isLatest={i === 0} />
                    ))}
                </div>
            )}
        </div>
    );
};
