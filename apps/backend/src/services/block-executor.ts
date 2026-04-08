/**
 * Block executor — runs a single block's logic.
 * Currently fake (Phase 3B); Phase 4 will wire real AI/tool calls.
 */

export const blockExecutor = {
    /**
     * Execute a single block.
     * Returns the output payload and how long it took (ms).
     *
     * @param blockType  The type identifier of the block (e.g. "ai-generate", "parse-document")
     * @param input      The resolved input payload for this block
     */
    async execute(blockType: string, input: unknown): Promise<{ output: Record<string, unknown>; durationMs: number }> {
        const start = Date.now();

        // Phase 3B: fake output based on blockType
        const output: Record<string, unknown> = {
            result: `[fake] ${blockType} completed`,
            blockType,
            timestamp: new Date().toISOString(),
            inputReceived: input !== undefined,
        };

        const durationMs = Date.now() - start;
        return { output, durationMs };
    },
};
