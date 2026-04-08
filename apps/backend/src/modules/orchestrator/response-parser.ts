import { z } from 'zod';

import { log } from '../../utils/logger';

/**
 * Parses and validates Claude's JSON response into a typed proposal structure.
 * On validation failure: returns { ok: false } with error details for trace logging.
 */

// ============================================================================
// Schema for Claude's expected output
// ============================================================================

const BlockSchema = z.object({
    type: z.string(),
    label: z.string(),
    config: z.record(z.unknown()).optional().default({}),
});

const EdgeSchema = z.object({
    from: z.number().int().min(0),
    to: z.number().int().min(0),
});

export const ClaudeProposalOutputSchema = z.object({
    blocks: z.array(BlockSchema).min(1),
    edges: z.array(EdgeSchema),
    estimatedCostUsd: z.number().min(0),
    summary: z.string(),
});

export type ClaudeProposalOutput = z.infer<typeof ClaudeProposalOutputSchema>;

// ============================================================================
// Parser
// ============================================================================

export interface ParseSuccess {
    ok: true;
    data: ClaudeProposalOutput;
}

export interface ParseFailure {
    ok: false;
    rawContent: string;
    error: string;
    zodErrors?: z.ZodError['issues'];
}

export type ParseResult = ParseSuccess | ParseFailure;

export const parseClaudeResponse = (rawContent: string): ParseResult => {
    // Step 1: Extract JSON from response (handle markdown fences)
    let jsonStr = rawContent.trim();

    // Strip markdown code fences if present
    const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
        jsonStr = fenceMatch[1].trim();
    }

    // Step 2: Parse JSON
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonStr);
    } catch (err) {
        log.warn('Claude response is not valid JSON', { contentLength: rawContent.length });
        return {
            ok: false,
            rawContent,
            error: `JSON parse error: ${err instanceof Error ? err.message : String(err)}`,
        };
    }

    // Step 3: Validate with zod
    const result = ClaudeProposalOutputSchema.safeParse(parsed);
    if (!result.success) {
        log.warn('Claude response failed schema validation', {
            issues: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
        });
        return {
            ok: false,
            rawContent,
            error: 'Schema validation failed',
            zodErrors: result.error.issues,
        };
    }

    return { ok: true, data: result.data };
};
