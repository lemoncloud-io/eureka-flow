import React, { useState } from 'react';

import { Check, Loader2, Play } from 'lucide-react';

import { cn } from '@flows/lib/utils';

import type { NodeState } from '@flows/flows';

/** Renders status indicator icon for node execution state */
export const StatusIcon: React.FC<{ state: NodeState }> = ({ state }) => {
    switch (state) {
        case 'RUNNING':
            return <Loader2 className="w-4 h-4 text-status-running animate-spin" />;
        case 'COMPLETED':
            return <Check className="w-4 h-4 text-status-completed" />;
        case 'ERROR':
            return (
                <div className="w-4 h-4 rounded-full bg-destructive/20 flex items-center justify-center">
                    <span className="text-destructive font-bold text-[10px]">!</span>
                </div>
            );
        default:
            return null;
    }
};

/** Paired run buttons for process nodes: "Run This Only" + "Run & Propagate" */
export const ProcessRunButtons: React.FC<{
    isRunning: boolean;
    onRun: (options: { propagate: boolean }) => void;
    t: (key: string) => string;
    variant: 'compact' | 'full';
}> = ({ isRunning, onRun, t, variant }) => {
    const [showMenu, setShowMenu] = useState(false);
    const icon = isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />;

    if (variant === 'full') {
        return (
            <div className="flex gap-1.5" onMouseDown={e => e.stopPropagation()}>
                <button
                    onClick={() => onRun({ propagate: false })}
                    disabled={isRunning}
                    className={cn(
                        'flex-1 text-[11px] py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 font-medium',
                        isRunning
                            ? 'bg-muted/30 text-muted-foreground border border-muted cursor-not-allowed'
                            : 'bg-primary/15 hover:bg-primary/25 text-primary border border-primary/20'
                    )}
                >
                    {icon}
                    {t('actions.runThisOnly')}
                </button>
                <button
                    onClick={() => onRun({ propagate: true })}
                    disabled={isRunning}
                    className={cn(
                        'flex-1 text-[11px] py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 font-medium',
                        isRunning
                            ? 'bg-muted/30 text-muted-foreground border border-muted cursor-not-allowed'
                            : 'bg-green-500/15 hover:bg-green-500/25 text-green-600 dark:text-green-400 border border-green-500/20'
                    )}
                >
                    {icon}
                    {t('actions.runAndPropagate')}
                </button>
            </div>
        );
    }

    // compact: single button [▶] that opens dropdown on click (same size as input run button)
    return (
        <div className="relative">
            <button
                onClick={e => {
                    e.stopPropagation();
                    setShowMenu(prev => !prev);
                }}
                onMouseDown={e => e.stopPropagation()}
                disabled={isRunning}
                className={cn(
                    'w-6 h-6 rounded-md flex items-center justify-center transition-all',
                    isRunning
                        ? 'bg-muted/30 text-muted-foreground cursor-not-allowed'
                        : 'bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-400'
                )}
                title={t('actions.runOptions')}
            >
                {icon}
            </button>
            {showMenu && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={e => {
                            e.stopPropagation();
                            setShowMenu(false);
                        }}
                        onMouseDown={e => e.stopPropagation()}
                    />
                    <div className="absolute top-full right-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[140px]">
                        <button
                            className="w-full px-3 py-1.5 text-[11px] text-left hover:bg-muted/50 flex items-center gap-2 transition-colors"
                            onClick={e => {
                                e.stopPropagation();
                                setShowMenu(false);
                                onRun({ propagate: false });
                            }}
                            onMouseDown={e => e.stopPropagation()}
                        >
                            <Play className="w-3 h-3 text-green-500" />
                            {t('actions.runThisOnly')}
                        </button>
                        <button
                            className="w-full px-3 py-1.5 text-[11px] text-left hover:bg-muted/50 flex items-center gap-2 transition-colors"
                            onClick={e => {
                                e.stopPropagation();
                                setShowMenu(false);
                                onRun({ propagate: true });
                            }}
                            onMouseDown={e => e.stopPropagation()}
                        >
                            <Play className="w-3 h-3 text-primary" />
                            {t('actions.runAndPropagate')}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};
