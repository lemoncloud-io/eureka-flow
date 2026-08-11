import { MESSAGE } from '../events';

import type { TraceRecord } from '../sink';
import type { AgentTranscript, ChatEntry } from './types';

/**
 * Project the record stream into one chat transcript per agent instance (`gen_ai.agent.id`), folding the
 * `message` events in emission (file) order. Ids stay behind as correlation keys — the chat is role-labelled
 * text with tool calls inline.
 */
export const toTranscripts = (records: TraceRecord[]): AgentTranscript[] => {
    const byInstance = new Map<string, AgentTranscript>();

    for (const record of records) {
        if (record.name !== MESSAGE) {
            continue;
        }
        const agentId = String(record.context['gen_ai.agent.id'] ?? record.context.flowPath ?? 'unknown');

        let transcript = byInstance.get(agentId);
        if (!transcript) {
            transcript = {
                agentType: String(record.context['gen_ai.agent.name'] ?? ''),
                agentId,
                flowPath: String(record.context.flowPath ?? ''),
                chat: [],
            };
            byInstance.set(agentId, transcript);
        }
        transcript.chat.push(toChatEntry(record));
    }

    return [...byInstance.values()];
};

const toChatEntry = (record: TraceRecord): ChatEntry => {
    const fields = record.fields;
    const entry: ChatEntry = {
        role: fields.role as ChatEntry['role'],
        text: typeof fields.content === 'string' ? fields.content : '',
    };
    if (Array.isArray(fields.toolCalls)) {
        entry.toolCalls = (fields.toolCalls as Array<{ name: string; args: unknown }>).map(call => ({
            name: call.name,
            args: call.args,
        }));
    }
    if (typeof fields.toolCallId === 'string') {
        entry.toolCallId = fields.toolCallId;
    }
    return entry;
};
