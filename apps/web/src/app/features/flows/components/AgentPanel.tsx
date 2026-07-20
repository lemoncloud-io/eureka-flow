import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Send, Sparkles } from 'lucide-react';

import { cn } from '@flows/lib/utils';

import { useLocatorAgent } from '../hooks/useLocatorAgent';

import type { AgentEnvironmentSupportable, CanvasBinding, LlmGateway, Message, ToolExecutor } from '@flows/agent';

interface AgentPanelProps {
    binding: CanvasBinding;
    flowId: string;
    gateway: LlmGateway;
    /** The browser Agent Environment; session persistence and run tracing flow through it. */
    environment: AgentEnvironmentSupportable;
    /** Optional executor override (e.g. wrapped with tracing). */
    executor?: ToolExecutor;
}

/** Messages the user should see: their own turns and the agent's text replies. */
const isVisible = (m: Message): boolean =>
    m.role === 'user' || (m.role === 'assistant' && !!m.content && m.content.trim().length > 0);

/**
 * The always-present, right-docked assistant panel (spec 0002 §6.5). It renders purely from
 * the session store and emits `send` — all editing goes through the agent, which is the sole
 * editor of the canvas (§2.1). Docked as a fixed-width column that shrinks the canvas region
 * (§6.5) — it does not overlay it.
 */
export const AgentPanel = ({ binding, flowId, gateway, environment, executor }: AgentPanelProps) => {
    const { t } = useTranslation(['flows']);
    const { session, send } = useLocatorAgent({ binding, flowId, gateway, environment, executor });
    const [draft, setDraft] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    const phase = session?.phase ?? 'idle';
    const isThinking = phase === 'thinking';
    const messages = (session?.messages ?? []).filter(isVisible);

    // Keep the latest message in view as the transcript grows.
    // (`scrollTo` is guarded — jsdom / older engines may not implement it.)
    useEffect(() => {
        const el = scrollRef.current;
        el?.scrollTo?.({ top: el.scrollHeight });
    }, [session]);

    const submit = () => {
        if (isThinking) {
            return;
        }
        const text = draft.trim();
        if (!text) {
            return;
        }
        setDraft('');
        send(text);
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
                        {t('agentPanel.subtitle', 'Move nodes with commands like move(Fetch, up, 10).')}
                    </span>
                </div>
            </div>

            {/* Transcript */}
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {messages.length === 0 ? (
                    <div className="whitespace-pre-line pt-6 text-center text-xs text-muted-foreground/60">
                        {t(
                            'agentPanel.empty',
                            'Type a command to move a node:\nmove(Fetch, up, 10)\nmove(Email, to, 100, 200)\nlist'
                        )}
                    </div>
                ) : (
                    messages.map(m => (
                        <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                            <div
                                className={cn(
                                    'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm',
                                    m.role === 'user' ? 'bg-primary/15 text-foreground' : 'bg-muted/40 text-foreground'
                                )}
                            >
                                {m.content}
                            </div>
                        </div>
                    ))
                )}

                {isThinking && (
                    <div className="flex justify-start">
                        <div className="rounded-2xl bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                            {t('agentPanel.thinking', 'Thinking…')}
                        </div>
                    </div>
                )}

                {phase === 'error' && session?.error && (
                    <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        {session.error}
                    </div>
                )}
            </div>

            {/* Composer */}
            <div className="border-t border-border/40 p-3">
                <div className="flex items-end gap-2 rounded-xl border border-border/40 bg-muted/30 px-2 py-1.5 focus-within:border-primary/60">
                    <textarea
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onKeyDown={onKeyDown}
                        rows={1}
                        placeholder={t('agentPanel.placeholder', 'Move a node…')}
                        className="max-h-32 flex-1 resize-none bg-transparent px-1 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
                    />
                    <button
                        type="button"
                        aria-label={t('agentPanel.send', 'Send')}
                        onClick={submit}
                        disabled={isThinking || draft.trim().length === 0}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
                    >
                        <Send className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </aside>
    );
};
