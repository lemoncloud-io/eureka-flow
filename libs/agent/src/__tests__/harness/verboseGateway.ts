import type { ChatMessage, ChatRequest, Chunk, LlmGateway } from '../../llm/llmGateway';

/**
 * Wrap an {@link LlmGateway} to print each turn's chat to the terminal — what the agent RECEIVES (new
 * user / tool-result / system messages) and what it RESPONDS (assistant text + tool calls). A pure
 * logging pass-through: every chunk is forwarded unchanged and nothing is persisted. Used only by the
 * LIVE scenarios, behind the `LIVE_VERBOSE` flag. `label` is the agent type (orchestrator/locator/property);
 * with parallel children of the same type, lines interleave — the task text disambiguates.
 *
 * `full` (LIVE_VERBOSE=full): print every message/response VERBATIM (original newlines, no truncation) —
 * use it to read a whole system prompt or a long tool result. Default (compact) collapses each to one
 * truncated line so the flow stays scannable.
 */
export const verboseGateway = (inner: LlmGateway, label: string, full = false): LlmGateway => {
    // Compact: one truncated line. Full: verbatim, keeping newlines so long prompts/results stay readable.
    const preview = (s: string | null | undefined, n = 400): string => {
        const raw = (s ?? '').trim();
        if (full) return raw;
        const t = raw.replace(/\s+/g, ' ');
        return t.length > n ? `${t.slice(0, n)}… (+${t.length - n} more chars)` : t;
    };

    // One incoming (non-assistant) message as a "receives" line. Assistant messages are shown as RESPONDS.
    const logReceive = (m: ChatMessage): void => {
        if (m.role === 'system') console.log(`  ⟨${label}⟩ ◀ system : ${preview(m.content, 300)}`);
        else if (m.role === 'tool')
            {console.log(`  ⟨${label}⟩ ◀ result : [${m.toolCallId ?? '?'}] ${preview(m.content)}`);}
        else if (m.role === 'user') console.log(`  ⟨${label}⟩ ◀ user   : ${preview(m.content)}`);
    };

    let printed = 0; // messages already logged for this agent, across its think/act iterations
    return {
        capabilities: inner.capabilities,
        async *chat(req: ChatRequest, opts?: { signal?: AbortSignal }): AsyncIterable<Chunk> {
            for (let i = printed; i < req.messages.length; i += 1) logReceive(req.messages[i]);
            printed = req.messages.length;

            const acc = new Map<string, { name: string; args: string }>();
            const order: string[] = [];
            let text = '';
            for await (const chunk of inner.chat(req, opts)) {
                if (chunk.text) text += chunk.text;
                if (chunk.toolCall) {
                    const { id, name, argsDelta } = chunk.toolCall;
                    const cur = acc.get(id);
                    if (cur) cur.args += argsDelta;
                    else {
                        order.push(id);
                        acc.set(id, { name, args: argsDelta });
                    }
                }
                yield chunk;
            }

            if (text.trim()) console.log(`  ⟨${label}⟩ ▶ says   : ${preview(text)}`);
            for (const id of order) {
                const c = acc.get(id) as { name: string; args: string };
                console.log(`  ⟨${label}⟩ ▶ calls  : ${c.name}(${preview(c.args, 300)})`);
            }
            if (!text.trim() && order.length === 0) console.log(`  ⟨${label}⟩ ▶ (no text, no tool calls)`);
        },
    };
};
