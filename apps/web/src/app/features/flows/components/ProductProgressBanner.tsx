import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { CheckCircle2, X, XCircle } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

import {
    averageProgress,
    computeEta,
    formatEta,
    isErrorProductState,
    isTerminalProductState,
    useProductProgressStore,
} from '@flows/flows';
import { cn } from '@flows/lib/utils';

import type { ProductProgressEntry } from '@flows/flows';

const AUTO_DISMISS_MS = 5000;

interface ProductProgressCardProps {
    entry: ProductProgressEntry;
    onDismiss: (productId: string) => void;
}

const ProductProgressCard = ({ entry, onDismiss }: ProductProgressCardProps) => {
    const { t } = useTranslation();
    const overall = useMemo(() => averageProgress(entry.progress$), [entry.progress$]);
    const eta = useMemo(() => computeEta(entry.timestamps, overall), [entry.timestamps, overall]);
    const phases = useMemo(() => Object.entries(entry.progress$), [entry.progress$]);
    const isTerminal = isTerminalProductState(entry.state);
    const isError = isErrorProductState(entry.state);

    useEffect(() => {
        if (!isTerminal) return;
        const timer = setTimeout(() => onDismiss(entry.productId), AUTO_DISMISS_MS);
        return () => clearTimeout(timer);
    }, [isTerminal, entry.productId, onDismiss]);

    return (
        <div
            className={cn(
                'flex w-80 flex-col gap-2 rounded-lg border bg-card p-3 shadow-lg',
                isTerminal && !isError && 'border-green-500/40',
                isError && 'border-red-500/50'
            )}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    {isTerminal && !isError && <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />}
                    {isError && <XCircle className="h-4 w-4 shrink-0 text-red-500" />}
                    <span className="truncate text-xs font-mono text-muted-foreground">{entry.productId}</span>
                </div>
                <span
                    className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                        isError ? 'bg-red-500/10 text-red-500' : 'bg-primary/10 text-primary'
                    )}
                >
                    {entry.state}
                </span>
                <button
                    onClick={() => onDismiss(entry.productId)}
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label={t('flows.dismiss', 'Dismiss')}
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>

            <div className="space-y-1">
                {phases.map(([phase, percent]) => (
                    <div key={phase} className="space-y-0.5">
                        <div className="flex items-center justify-between text-[11px]">
                            <span className="font-medium text-foreground/80">{phase}</span>
                            <span className="tabular-nums text-muted-foreground">{Math.round(percent)}%</span>
                        </div>
                        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                            <div
                                className={cn(
                                    'h-full rounded-full transition-all duration-300',
                                    isError ? 'bg-red-500' : 'bg-primary'
                                )}
                                style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                            />
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold">
                    {t('flows.progress', 'Progress')}: <span className="tabular-nums">{overall}%</span>
                </span>
                {eta !== null && !isTerminal && (
                    <span className="text-muted-foreground">
                        {t('flows.eta', 'Est.')} {formatEta(eta)}
                    </span>
                )}
            </div>
        </div>
    );
};

export const ProductProgressBanner = () => {
    const sorted = useProductProgressStore(
        useShallow(state => Object.values(state.entries).sort((a, b) => b.updatedAt - a.updatedAt))
    );
    const dismissProgress = useProductProgressStore(state => state.dismissProgress);

    if (sorted.length === 0) return null;

    return (
        <div className="pointer-events-none fixed right-4 top-20 z-40 flex flex-col gap-2">
            {sorted.map(entry => (
                <div key={entry.productId} className="pointer-events-auto">
                    <ProductProgressCard entry={entry} onDismiss={dismissProgress} />
                </div>
            ))}
        </div>
    );
};
