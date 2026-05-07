import React, { useCallback, useRef, useState } from 'react';

import { Check, Loader2 } from 'lucide-react';

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
    const [menuState, setMenuState] = useState<'closed' | 'open' | 'closing'>('closed');
    const closingTimer = useRef<number | null>(null);
    const isRunningRef = useRef(isRunning);
    isRunningRef.current = isRunning;

    const openMenu = useCallback(() => {
        if (isRunningRef.current) return;
        if (closingTimer.current) {
            window.clearTimeout(closingTimer.current);
            closingTimer.current = null;
        }
        setMenuState(prev => (prev === 'open' ? prev : 'open'));
    }, []);

    const closeMenu = useCallback(() => {
        setMenuState(prev => {
            if (prev !== 'open') return prev;
            closingTimer.current = window.setTimeout(() => {
                setMenuState('closed');
                closingTimer.current = null;
            }, 100);
            return 'closing';
        });
    }, []);

    if (variant === 'full') {
        const spinner = <Loader2 className="w-3.5 h-3.5 animate-spin" />;
        return (
            <div className="flex gap-1.5" onMouseDown={e => e.stopPropagation()}>
                <button
                    onClick={() => onRun({ propagate: false })}
                    disabled={isRunning}
                    className={cn(
                        'flex-1 text-[11px] py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 font-semibold',
                        isRunning
                            ? 'bg-muted/30 text-muted-foreground border border-muted cursor-not-allowed'
                            : 'bg-primary hover:bg-primary/90 text-primary-foreground'
                    )}
                >
                    {isRunning ? spinner : null}
                    {t('actions.runThisOnly')}
                </button>
                <button
                    onClick={() => onRun({ propagate: true })}
                    disabled={isRunning}
                    className={cn(
                        'flex-1 text-[11px] py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 font-medium',
                        isRunning
                            ? 'bg-muted/30 text-muted-foreground border border-muted cursor-not-allowed'
                            : 'border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary'
                    )}
                >
                    {isRunning ? spinner : null}
                    {t('actions.runAndPropagate')}
                </button>
            </div>
        );
    }

    // compact: single button that opens dropdown on hover
    const runningIcon = <Loader2 className="w-3.5 h-3.5 animate-spin" />;
    const playIcon = <img src="/play.svg" alt="" className="w-3.5 h-3.5" />;

    return (
        <div className="relative" onMouseEnter={openMenu} onMouseLeave={closeMenu}>
            <button
                onClick={e => {
                    e.stopPropagation();
                    openMenu();
                }}
                onMouseDown={e => e.stopPropagation()}
                disabled={isRunning}
                className={cn(
                    'w-7 h-7 rounded-md border border-border/60 flex items-center justify-center transition-all',
                    isRunning
                        ? 'bg-muted/30 text-muted-foreground cursor-not-allowed'
                        : 'bg-transparent hover:bg-muted/30 text-primary'
                )}
                title={t('actions.runOptions')}
            >
                {isRunning ? runningIcon : playIcon}
            </button>
            {menuState !== 'closed' && (
                <div
                    className="absolute top-full left-1/2 -translate-x-1/2 pt-1 z-50"
                    onMouseDown={e => e.stopPropagation()}
                >
                    <div
                        className={cn(
                            'bg-background border border-border/60 rounded-lg shadow-[0_4px_8px_rgba(0,0,0,0.08)] px-2.5 py-2 duration-100',
                            menuState === 'open' && 'animate-in fade-in zoom-in-95',
                            menuState === 'closing' && 'animate-out fade-out zoom-out-95'
                        )}
                    >
                        <div className="flex gap-0.5">
                            <button
                                className="px-2 py-1 text-xs font-medium rounded-md bg-primary hover:bg-primary/90 text-primary-foreground whitespace-nowrap transition-colors"
                                onClick={e => {
                                    e.stopPropagation();
                                    setMenuState('closed');
                                    onRun({ propagate: false });
                                }}
                            >
                                {t('actions.runThisOnly')}
                            </button>
                            <button
                                className="px-2 py-1 text-xs font-medium rounded-md border border-border/60 bg-background hover:bg-muted/50 text-primary whitespace-nowrap transition-colors"
                                onClick={e => {
                                    e.stopPropagation();
                                    setMenuState('closed');
                                    onRun({ propagate: true });
                                }}
                            >
                                {t('actions.runAndPropagate')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
