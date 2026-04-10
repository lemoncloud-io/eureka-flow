import { useTranslation } from 'react-i18next';

import { Loader2, Play, Plus } from 'lucide-react';

import { cn } from '@flows/lib/utils';

interface RunProgress {
    current: number;
    total: number;
}

interface MobileBottomBarProps {
    onAddBlock: () => void;
    onRunAll: () => void;
    isRunning: boolean;
    progress: RunProgress | null;
    isReadOnly?: boolean;
    nodeCount: number;
}

export const MobileBottomBar = ({
    onAddBlock,
    onRunAll,
    isRunning,
    progress,
    isReadOnly,
    nodeCount,
}: MobileBottomBarProps) => {
    const { t } = useTranslation(['flows']);

    const progressPct = progress && progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

    if (isReadOnly) return null;

    return (
        <div
            className={cn(
                'fixed bottom-0 left-0 right-0 z-30',
                'pb-[env(safe-area-inset-bottom)]',
                'bg-background/80 backdrop-blur-2xl',
                'border-t border-border/30'
            )}
        >
            <div className="flex items-center gap-2.5 px-4 py-2.5">
                {/* Add Block */}
                <button
                    onClick={onAddBlock}
                    disabled={isRunning}
                    className={cn(
                        'flex items-center gap-2 px-4 h-11 rounded-xl shrink-0',
                        'bg-card border border-border/50',
                        'text-sm font-medium',
                        'active:scale-[0.96] transition-all duration-150',
                        'disabled:opacity-40'
                    )}
                >
                    <Plus className="w-4 h-4 text-primary" />
                    <span>{t('mobile.addBlock', 'Add')}</span>
                </button>

                {/* Run All */}
                <button
                    onClick={onRunAll}
                    disabled={nodeCount === 0 || isRunning}
                    className={cn(
                        'flex-1 h-11 rounded-xl relative overflow-hidden',
                        'text-sm font-semibold',
                        'active:scale-[0.97] transition-all duration-200',
                        'disabled:opacity-40',
                        isRunning
                            ? 'bg-warning/10 border border-warning/25 text-warning'
                            : 'bg-primary text-primary-foreground shadow-sm shadow-primary/25'
                    )}
                >
                    {/* Progress fill */}
                    {isRunning && progress && (
                        <div
                            className="absolute inset-y-0 left-0 bg-warning/10 transition-[width] duration-500 ease-out"
                            style={{ width: `${progressPct}%` }}
                        />
                    )}

                    <span className="relative flex items-center justify-center gap-2">
                        {isRunning ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>
                                    {progress
                                        ? `${progress.current} / ${progress.total}`
                                        : t('mobile.running', 'Running...')}
                                </span>
                            </>
                        ) : (
                            <>
                                <Play className="w-4 h-4 fill-current" />
                                <span>{t('header.runAll', 'Run All')}</span>
                                {nodeCount > 0 && <span className="text-xs opacity-60">({nodeCount})</span>}
                            </>
                        )}
                    </span>
                </button>
            </div>
        </div>
    );
};
