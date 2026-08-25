import type { Chunk } from '../../llm/llmGateway';

/** A tool call as it arrives on a chunk — the stream's optional field, with the `undefined` taken off. */
export type StreamedToolCall = NonNullable<Chunk['toolCall']>;

/**
 * The first tool call in a chunk stream (throws if the stream carried none — a test-only convenience, like
 * `nodeOfType` in the harness fixtures). A gateway spec that dispatches the call it just parsed needs three
 * fields off it (`id`, `name`, `argsDelta`); throwing here asserts presence once and narrows the type, so
 * those reads need no non-null assertions, and the failure names what the stream did contain.
 */
export const firstToolCall = (chunks: Chunk[]): StreamedToolCall => {
    const found = chunks.find(c => c.toolCall)?.toolCall;
    if (!found) {
        const shape = chunks.map(c => Object.keys(c).join('+') || '(empty)').join(', ') || '(no chunks)';
        throw new Error(`spec: no tool call in the chunk stream — chunks held: ${shape}`);
    }
    return found;
};
