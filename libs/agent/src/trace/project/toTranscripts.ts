import { MESSAGE } from '../events';

import type { TraceRecord } from '../sink';
import type { AgentTranscript, ChatEntry } from './types';

/**
 * Project the record stream into one chat transcript per agent instance, folding the `message` events in
 * emission (file) order. Instances are keyed by the epoch-unique `flowPath` (`<flowId>#<epoch>:<agentId>`),
 * like the forest — a child's `agentId` (`builder#1`) restarts its spawn counter when a reload/model switch
 * rebuilds the runner, so agentId alone would fold two distinct cross-epoch instances into one chat. The
 * agentId rides along as the human-readable label; the chat is role-labelled text with tool calls inline.
 */
export const toTranscripts = (records: TraceRecord[]): AgentTranscript[] => {
    const byInstance = new Map<string, AgentTranscript>();

    for (const record of records) {
        if (record.name !== MESSAGE) {
            continue;
        }
        const flowPath = String(record.context.flowPath ?? '');
        const key = flowPath || String(record.context['gen_ai.agent.id'] ?? 'unknown');

        let transcript = byInstance.get(key);
        if (!transcript) {
            transcript = {
                agentType: String(record.context['gen_ai.agent.name'] ?? ''),
                agentId: String(record.context['gen_ai.agent.id'] ?? flowPath),
                flowPath,
                chat: [],
            };
            byInstance.set(key, transcript);
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
