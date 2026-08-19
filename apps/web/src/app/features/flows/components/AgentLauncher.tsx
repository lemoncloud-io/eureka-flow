import { useTranslation } from 'react-i18next';

import { Bot } from 'lucide-react';

import { cn } from '@flows/lib/utils';

import { buildTranscript } from '../utils/agentTurnLedger';

import type { SessionState } from '@flows/agent';

/**
 * The collapsed assistant — a handle on the right edge, mirroring the block library's handle on the
 * left. Closed, the canvas is whole; the handle is the way back in. It widens into a live count only
 * while a turn is running, because that is the one time the panel being closed could hide something
 * the user needs to know: the agent is still editing their flow.
 *
 * A pure view over the same `session` the panel renders, so the two can never disagree about whether
 * a turn is in flight.
 */
export const AgentLauncher = ({ session, onOpen }: { session: SessionState | null; onOpen: () => void }) => {
    const { t } = useTranslation(['flows']);
    const running = session?.phase === 'thinking';
    const changes = running
        ? buildTranscript(session).reduce((n, item) => (item.kind === 'ledger' ? n + item.ops.length : n), 0)
        : 0;

    return (
        <div className="pointer-events-auto absolute right-4 top-1/2 z-30 -translate-y-1/2">
            <div
                className={cn(
                    'rounded-2xl border border-border/40 bg-glass-bg p-2 backdrop-blur-2xl',
                    'shadow-floating'
                )}
            >
                <button
                    type="button"
                    onClick={onOpen}
                    aria-expanded={false}
                    aria-label={t('agentPanel.open', 'Open the assistant')}
                    className={cn(
                        'flex h-8 items-center justify-center gap-1.5 rounded-lg transition-all duration-150',
                        'text-muted-foreground hover:bg-accent hover:text-foreground',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                        running ? 'w-auto px-2 text-primary' : 'w-8'
                    )}
                >
                    <Bot className="h-4 w-4 shrink-0" />
                    {running && (
                        <>
                            <span className="text-[11px] font-medium tabular-nums">
                                {t('agentPanel.ledger.changes', '{{count}} changes', { count: changes })}
                            </span>
                            <span
                                aria-hidden
                                className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary motion-safe:animate-pulse"
                            />
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};
