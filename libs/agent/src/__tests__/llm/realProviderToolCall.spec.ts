import { afterEach, describe, expect, it } from 'vitest';

import { createFetchHttpClient } from '../../http/FetchHttpClient';
import { createGeminiToolLlmGateway } from '../../llm/GeminiToolLlmGateway';
import { createOpenAiLlmGateway } from '../../llm/OpenAiLlmGateway';
import { wrapGatewayWithUsageCapture } from '../../llm/verificationMetrics';
import { verifyMoveNodeToolCall } from '../../llm/verifyProviderToolCall';

import type { UsageTotals } from '../../llm/verificationMetrics';

/**
 * Env-gated real-provider tool-call verification: gateway + ToolExecutor, single turn.
 *
 * Each provider block is skipped entirely unless BOTH `RUN_LIVE_PROVIDER_TESTS=1` is explicitly
 * set AND its key env var is present — a key alone is not sufficient (same explicit-opt-in rule
 * `realLocatorScenarios.spec.ts` enforces). CI and keyless/opted-out runs never hit the network,
 * and no key is ever read into a browser bundle (this is a Node test env; keys are `process.env`
 * only, never `VITE_` vars) or logged. A provider's tool calling is not
 * considered verified until its env-gated block has actually run green against the live API; the
 * offline `*.spec.ts` files (and `verifyProviderToolCall.spec.ts`) prove only the mapping/
 * parsing/scoring logic, not the models' behavior.
 *
 * The verification scenario itself lives in `verifyMoveNodeToolCall`, so there is exactly one
 * implementation of "ask the model to move the node, dispatch the result, check the position".
 *
 * Each `it` below logs its own elapsed time (measured at the call site, around
 * `verifyMoveNodeToolCall`) and token usage (best-effort, via `wrapGatewayWithUsageCapture` —
 * null when the provider doesn't report it). This is console-only, not a written artifact — this
 * file exercises only OpenAI/Gemini's default model on one fixed scenario, a subset of what
 * `realLocatorScenarios.spec.ts`'s registry-driven matrix already covers with a full report (see
 * verificationMetrics.ts); a second artifact writer here would just be two sources of truth for
 * overlapping data.
 */
let scenarioStartedAt = 0;
let capturedUsage: UsageTotals = { inputTokens: null, outputTokens: null, totalTokens: null };

afterEach(() => {
    if (scenarioStartedAt === 0) return;
    const elapsedMs = Date.now() - scenarioStartedAt;
    const tokens =
        capturedUsage.totalTokens === null
            ? 'usage n/a'
            : `${capturedUsage.inputTokens ?? '?'} in / ${capturedUsage.outputTokens ?? '?'} out / ${capturedUsage.totalTokens} total tokens`;
    console.log(`[verificationMetrics] realProviderToolCall: ${elapsedMs}ms, ${tokens}`);
    scenarioStartedAt = 0;
    capturedUsage = { inputTokens: null, outputTokens: null, totalTokens: null };
});

const LIVE_RUN_OPTED_IN = process.env['RUN_LIVE_PROVIDER_TESTS'] === '1';
const OPENAI_API_KEY = process.env['OPENAI_API_KEY'];
const OPENAI_MODEL = process.env['OPENAI_TEST_MODEL']; // optional override; default gpt-4o-mini
const GEMINI_API_KEY = process.env['GEMINI_API_KEY'];
const GEMINI_MODEL = process.env['GEMINI_TEST_MODEL']; // optional override; default gemini-2.5-flash

describe.runIf(LIVE_RUN_OPTED_IN && !!OPENAI_API_KEY)('OpenAI real tool-call verification (env-gated)', () => {
    it('returns a structured move_node call that ToolExecutor executes: (100,200) -> (200,200)', async () => {
        scenarioStartedAt = Date.now();
        const gateway = wrapGatewayWithUsageCapture(
            createOpenAiLlmGateway({
                http: createFetchHttpClient(),
                apiKey: OPENAI_API_KEY as string,
                ...(OPENAI_MODEL ? { model: OPENAI_MODEL } : {}),
            }),
            usage => {
                capturedUsage = usage;
            }
        );
        const result = await verifyMoveNodeToolCall(gateway);

        expect(result.error).toBeUndefined();
        expect(result.pass).toBe(true);
        expect(result.toolCallName).toBe('move_node');
        expect(result.positionAfter).toEqual({ x: 200, y: 200 });
    });
});

describe.runIf(LIVE_RUN_OPTED_IN && !!GEMINI_API_KEY)('Gemini real tool-call verification (env-gated)', () => {
    it('returns a structured move_node call that ToolExecutor executes: (100,200) -> (200,200)', async () => {
        scenarioStartedAt = Date.now();
        const gateway = wrapGatewayWithUsageCapture(
            createGeminiToolLlmGateway({
                http: createFetchHttpClient(),
                apiKey: GEMINI_API_KEY as string,
                ...(GEMINI_MODEL ? { model: GEMINI_MODEL } : {}),
            }),
            usage => {
                capturedUsage = usage;
            }
        );
        const result = await verifyMoveNodeToolCall(gateway);

        expect(result.error).toBeUndefined();
        expect(result.pass).toBe(true);
        expect(result.toolCallName).toBe('move_node');
        expect(result.positionAfter).toEqual({ x: 200, y: 200 });
    });
});
