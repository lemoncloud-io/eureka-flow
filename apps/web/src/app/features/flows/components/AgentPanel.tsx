import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown, Send, Sparkles, Square } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@flows/ui-kit';

import { AgentTurnLedger } from './AgentTurnLedger';
import { buildTranscript } from '../utils/agentTurnLedger';

import type { SessionState } from '@flows/agent';

/** A model the agent can run on — the minimal shape the view needs (from the live catalog). */
export interface AgentModelOption {
    name: string;
    label: string;
}

interface AgentPanelProps {
    /** The session to render; null before the first turn / while the transcript is hydrating. */
    session: SessionState | null;
    /** Emit a user message. The container owns the agent; this panel is a pure view. */
    onSend: (text: string) => void;
    /** Reasoning-model options for the composer picker; empty/undefined hides it (still loading). */
    models?: AgentModelOption[];
    /** The current pick (highlighted). */
    selectedModel?: string;
    /** Choose a model; the container decides when it reaches the agent (next turn). */
    onSelectModel?: (name: string) => void;
    /** Stop the turn in flight. Omitted ⇒ no stop control (the composer just waits it out). */
    onAbort?: () => void;
}

/**
 * Composer model picker — the agent's reasoning model, ChatGPT/Claude-style, bottom-left of the
 * input. Purely presentational: options + selection come from the container. Hidden until the
 * catalog has options. Distinct from the generator block's `ModelSelect`: that picks the model the
 * built workflow runs (which needs the user's BYO provider key, hence its lock affordance); this
 * picks the model the assistant reasons with, which runs server-side and needs no user key — so
 * every catalog model here is selectable.
 */
const ModelPicker = ({
    options,
    value,
    onChange,
}: {
    options: AgentModelOption[];
    value?: string;
    onChange?: (name: string) => void;
}) => {
    const { t } = useTranslation(['flows']);
    const [open, setOpen] = useState(false);
    if (options.length === 0) {
        return null;
    }
    const selected = options.find(o => o.name === value);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="flex min-w-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60"
                >
                    <span className="max-w-[150px] truncate">
                        {selected?.label ?? value ?? t('agentPanel.model', 'Model')}
                    </span>
                    <ChevronDown className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-180')} />
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={4} className="max-h-64 w-56 overflow-y-auto p-1">
                {options.map(o => (
                    <button
                        key={o.name}
                        type="button"
                        onClick={() => {
                            onChange?.(o.name);
                            setOpen(false);
                        }}
                        className={cn(
                            'flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
                            o.name === value ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted/60'
                        )}
                    >
                        <span className="truncate">{o.label}</span>
                    </button>
                ))}
            </PopoverContent>
        </Popover>
    );
};

/** Cold start is the panel's hardest moment: give the user a first request to send, not a wall of quotes. */
const SUGGESTION_KEYS = ['build', 'tighten', 'rename', 'tidy'] as const;

const SUGGESTION_DEFAULTS: Record<(typeof SUGGESTION_KEYS)[number], string> = {
    build: 'Create a flow that writes a blog title',
    tighten: 'Make the titles short and punchy',
    rename: 'Rename the preview to Result',
    tidy: 'Line the nodes up in one column',
};

/**
 * The right-docked assistant panel — a pure view over the agent session: it renders the transcript
 * and emits `onSend`, owning no agent or wiring (a container like `FlowAgentPanel` supplies both).
 */
export const AgentPanel = ({
    session,
    onSend,
    models = [],
    selectedModel,
    onSelectModel,
    onAbort,
}: AgentPanelProps) => {
    const { t } = useTranslation(['flows']);
    const [draft, setDraft] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const phase = session?.phase ?? 'idle';
    const isThinking = phase === 'thinking';
    const items = useMemo(() => buildTranscript(session), [session]);
    // Only the turn in progress is live: an earlier turn's ledger stays folded and silent while a new
    // one runs, or every past request would spring open and announce itself again.
    const liveLedgerId = useMemo(() => {
        if (!isThinking) {
            return null;
        }
        const last = [...items].reverse().find(i => i.kind === 'ledger');
        return last?.id ?? null;
    }, [items, isThinking]);
    // The ledger rows are the progress indicator while they exist; the bare "Thinking…" line covers
    // the stretch before the first tool call, when there is nothing yet to show.
    const hasLiveOps = items.some(i => i.kind === 'ledger' && i.ops.some(op => op.status === 'running'));
    // A turn runs up to a dozen reasoning iterations with the composer disabled the whole time. The
    // send slot is dead weight in exactly that window, so it becomes the way out of it.
    const canStop = isThinking && !!onAbort;

    // Keep the latest message in view as the transcript grows.
    // (`scrollTo` is guarded — jsdom / older engines may not implement it.)
    useEffect(() => {
        const el = scrollRef.current;
        el?.scrollTo?.({ top: el.scrollHeight });
    }, [session]);

    /** Grow the composer with the draft, up to the same ceiling the scroll area used to impose. */
    const resize = (el: HTMLTextAreaElement | null): void => {
        if (!el) {
            return;
        }
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
    };

    const applySuggestion = (text: string): void => {
        setDraft(text);
        const el = inputRef.current;
        el?.focus();
        resize(el);
    };

    const submit = () => {
        if (isThinking) {
            return;
        }
        const text = draft.trim();
        if (!text) {
            return;
        }
        setDraft('');
        resize(inputRef.current);
        onSend(text);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Ignore Enter while an IME candidate is composing (Korean/Japanese/Chinese) —
        // that Enter confirms the candidate, it must not send the message.
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
        }
    };

    return (
        <aside
            aria-label={t('agentPanel.title', 'Assistant')}
            className="relative z-30 flex h-full w-[360px] shrink-0 flex-col overflow-hidden border-l border-border/40 bg-glass-bg backdrop-blur-2xl"
        >
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-border/40 px-4 py-3">
                <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                <div className="flex min-w-0 flex-col">
                    <span className="text-sm font-semibold text-foreground">{t('agentPanel.title', 'Assistant')}</span>
                    <span className="truncate text-[11px] text-muted-foreground">
                        {t('agentPanel.subtitle', 'Ask in plain language to build, edit, and arrange your flow.')}
                    </span>
                </div>
            </div>

            {/* Transcript */}
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {items.length === 0 ? (
                    <div className="space-y-2 pt-4">
                        <p className="text-xs text-muted-foreground/70">
                            {t('agentPanel.empty', 'Ask in plain language. For example:')}
                        </p>
                        <div className="flex flex-col items-start gap-1.5">
                            {SUGGESTION_KEYS.map(key => {
                                const text = t(`agentPanel.suggestions.${key}`, SUGGESTION_DEFAULTS[key]);
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => applySuggestion(text)}
                                        className={cn(
                                            'rounded-full border border-border/50 bg-muted/30 px-3 py-1.5 text-left text-xs',
                                            'text-muted-foreground transition-colors hover:border-primary/40',
                                            'hover:bg-primary/5 hover:text-foreground focus-visible:outline-none',
                                            'focus-visible:ring-1 focus-visible:ring-primary/60'
                                        )}
                                    >
                                        {text}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    items.map(item =>
                        item.kind === 'ledger' ? (
                            <AgentTurnLedger key={item.id} ops={item.ops} running={item.id === liveLedgerId} />
                        ) : (
                            <div
                                key={item.id}
                                className={cn('flex', item.message.role === 'user' ? 'justify-end' : 'justify-start')}
                            >
                                <div
                                    className={cn(
                                        'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm',
                                        item.message.role === 'user'
                                            ? 'bg-primary/15 text-foreground'
                                            : 'bg-muted/40 text-foreground'
                                    )}
                                >
                                    {item.message.content}
                                </div>
                            </div>
                        )
                    )
                )}

                {isThinking && !hasLiveOps && (
                    <div role="status" aria-live="polite" className="flex justify-start">
                        <div className="rounded-2xl bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                            {t('agentPanel.thinking', 'Thinking…')}
                        </div>
                    </div>
                )}

                {phase === 'error' && session?.error && (
                    <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
                        <p className="font-medium text-destructive">{t('agentPanel.errorTitle', 'The turn stopped')}</p>
                        <p className="mt-0.5 text-destructive/85">{session.error}</p>
                    </div>
                )}
            </div>

            {/* Composer */}
            <div className="border-t border-border/40 p-3">
                <div className="flex flex-col gap-1 rounded-xl border border-border/40 bg-muted/30 px-2 py-1.5 focus-within:border-primary/60">
                    <textarea
                        ref={inputRef}
                        value={draft}
                        onChange={e => {
                            setDraft(e.target.value);
                            resize(e.currentTarget);
                        }}
                        onKeyDown={onKeyDown}
                        rows={1}
                        placeholder={t('agentPanel.placeholder', 'Ask the assistant to build or edit your flow…')}
                        className="max-h-32 w-full resize-none bg-transparent px-1 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
                    />
                    <div className="flex items-center justify-between gap-2">
                        <ModelPicker options={models} value={selectedModel} onChange={onSelectModel} />
                        <button
                            type="button"
                            aria-label={canStop ? t('agentPanel.stop', 'Stop') : t('agentPanel.send', 'Send')}
                            onClick={canStop ? onAbort : submit}
                            disabled={isThinking ? !canStop : draft.trim().length === 0}
                            className={cn(
                                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary',
                                'text-primary-foreground transition-opacity focus-visible:outline-none',
                                'focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-40'
                            )}
                        >
                            {canStop ? <Square className="h-3 w-3 fill-current" /> : <Send className="h-4 w-4" />}
                        </button>
                    </div>
                </div>
            </div>
        </aside>
    );
};
