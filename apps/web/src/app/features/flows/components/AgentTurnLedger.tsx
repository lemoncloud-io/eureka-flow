import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { ChevronRight } from 'lucide-react';

import { cn } from '@flows/lib/utils';

import type { LedgerOp, LedgerOpKind, LedgerOpStatus } from '../utils/agentTurnLedger';

/**
 * The work the agent did for one request, as a wire running down the transcript with each change
 * hanging off it — the panel's answer to "what is it doing to my canvas right now". While the turn
 * runs the rows are the progress indicator; once it settles they fold into a single count, because
 * the user already watched it happen and the transcript should stay readable.
 */

/** English copy, also the shape each locale key follows. `<s>` is the subject, `<o>` the second party. */
const DEFAULTS: Record<`${LedgerOpKind}.${'running' | 'done'}`, string> = {
    'add.running': 'Adding <s>{{subject}}</s>…',
    'add.done': 'Added <s>{{subject}}</s>',
    'delete.running': 'Deleting <s>{{subject}}</s>…',
    'delete.done': 'Deleted <s>{{subject}}</s>',
    'connect.running': 'Connecting <s>{{subject}}</s> to <o>{{object}}</o>…',
    'connect.done': 'Connected <s>{{subject}}</s> to <o>{{object}}</o>',
    'disconnect.running': 'Disconnecting <s>{{subject}}</s>…',
    'disconnect.done': 'Disconnected <s>{{subject}}</s>',
    'move.running': 'Moving <s>{{subject}}</s>…',
    'move.done': 'Moved <s>{{subject}}</s>',
    'rename.running': 'Renaming <s>{{subject}}</s> to <o>{{object}}</o>…',
    'rename.done': 'Renamed <s>{{subject}}</s> to <o>{{object}}</o>',
    'configure.running': 'Configuring <s>{{subject}}</s>…',
    'configure.done': 'Configured <s>{{subject}}</s>',
    'delegate.running': 'Delegating to <s>{{subject}}</s>…',
    'delegate.done': 'Delegated to <s>{{subject}}</s>',
};

/** A thing on the canvas, named as the canvas names it — set apart from the surrounding sentence. */
const Chip = ({ children }: { children?: React.ReactNode }) => (
    <span className="mx-px rounded border border-border/60 bg-background/60 px-1 py-px font-medium text-foreground">
        {children}
    </span>
);

const Dot = ({ status }: { status: LedgerOpStatus }) => (
    <span
        className={cn(
            'mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full',
            status === 'error' && 'bg-destructive',
            status === 'running' && 'bg-primary motion-safe:animate-pulse',
            status === 'ok' && 'bg-primary/45'
        )}
    />
);

const Row = ({ op }: { op: LedgerOp }) => {
    const { t } = useTranslation(['flows']);
    const state = op.status === 'running' ? 'running' : 'done';
    const key = `${op.kind}.${state}` as keyof typeof DEFAULTS;
    const unknown = t('agentPanel.op.unknownTarget', 'a node');
    return (
        <li className="relative flex items-start gap-2 text-[11px] leading-5 text-muted-foreground">
            {/* The stub that ties this change back to the turn's wire. */}
            <span aria-hidden className="absolute -left-3 top-[9px] h-px w-2 bg-primary/25" />
            <Dot status={op.status} />
            <span className={cn('min-w-0 break-words', op.status === 'error' && 'text-destructive')}>
                <Trans
                    t={t}
                    i18nKey={`agentPanel.op.${key}`}
                    defaults={DEFAULTS[key]}
                    values={{ subject: op.subject ?? unknown, object: op.object ?? unknown }}
                    components={{ s: <Chip />, o: <Chip /> }}
                />
            </span>
        </li>
    );
};

export const AgentTurnLedger = ({ ops, running }: { ops: LedgerOp[]; running: boolean }) => {
    const { t } = useTranslation(['flows']);
    const [open, setOpen] = useState(false);
    const expanded = running || open;

    if (ops.length === 0) {
        return null;
    }

    return (
        <div className="pl-1">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                disabled={running}
                aria-expanded={expanded}
                className={cn(
                    'flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-muted-foreground/80',
                    'transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1',
                    'focus-visible:ring-primary/60 disabled:pointer-events-none'
                )}
            >
                <ChevronRight aria-hidden className={cn('h-3 w-3 transition-transform', expanded && 'rotate-90')} />
                {t('agentPanel.ledger.changes', '{{count}} changes', { count: ops.length })}
            </button>

            {expanded && (
                <ol
                    // The running rows are the only live status in the panel; announce them once, calmly.
                    {...(running ? { role: 'status' as const, 'aria-live': 'polite' as const } : {})}
                    className="ml-2 mt-1 space-y-0.5 border-l border-primary/25 pl-3"
                >
                    {ops.map(op => (
                        <Row key={op.id} op={op} />
                    ))}
                </ol>
            )}
        </div>
    );
};
