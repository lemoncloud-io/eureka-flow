import type { ChatRequest, Chunk, LlmGateway } from './llmGateway';

/** A scripted assistant turn: optional text and/or a batch of tool calls. */
export interface FakeResponse {
    text?: string;
    toolCalls?: { name: string; args: unknown }[];
}

/**
 * A response, or a function that produces one from the request (so a script can react
 * to the running conversation — e.g. emit a confirmation only after a tool result).
 */
export type FakeScriptStep = FakeResponse | ((req: ChatRequest) => FakeResponse);

/**
 * A deterministic {@link LlmGateway} for tests. Each call to `chat()` consumes the next
 * scripted step and streams it as {@link Chunk}s (tool-call args are emitted as a single
 * JSON `argsDelta`, exercising the agent's accumulate-then-parse path). When the script
 * is exhausted it yields an empty final turn (text `''`, no tool calls), which ends a
 * turn cleanly.
 *
 * `calls` records every request received, for assertions.
 */
export interface FakeGateway extends LlmGateway {
    readonly calls: ChatRequest[];
    /** True once every scripted step has been consumed. */
    isExhausted(): boolean;
}

export const createFakeGateway = (script: FakeScriptStep[]): FakeGateway => {
    const calls: ChatRequest[] = [];
    let cursor = 0;

    let idCounter = 0;
    const nextId = () => `fake-call-${(idCounter += 1)}`;

    async function* chat(req: ChatRequest, opts?: { signal?: AbortSignal }): AsyncIterable<Chunk> {
        calls.push(req);

        if (opts?.signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }

        const step = cursor < script.length ? script[cursor] : undefined;
        cursor += 1;
        const response: FakeResponse = typeof step === 'function' ? step(req) : (step ?? { text: '' });

        if (response.text) {
            yield { text: response.text };
        }
        for (const call of response.toolCalls ?? []) {
            yield { toolCall: { id: nextId(), name: call.name, argsDelta: JSON.stringify(call.args) } };
        }
        yield { done: true };
    }

    return {
        chat,
        calls,
        isExhausted: () => cursor >= script.length,
    };
};
