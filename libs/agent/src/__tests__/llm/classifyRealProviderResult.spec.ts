import { describe, expect, it } from 'vitest';

import {
    TIMEOUT_MARKER,
    classifyLocatorScenarioResult,
    classifyThrownError,
    isAcceptedOutcome,
} from '../../llm/classifyRealProviderResult';

import type { LocatorScenarioKnownVariance, LocatorScenarioResult } from '../../llm/verifyLocatorScenarios';

const baseResult: LocatorScenarioResult = {
    scenarioId: 'move-node-right',
    pass: false,
    toolCallName: null,
    textPresent: false,
    positionsBefore: { 'text-1': { x: 200, y: 200 } },
    positionsAfter: { 'text-1': { x: 200, y: 200 } },
};

const lookupFirstVariance: LocatorScenarioKnownVariance = {
    note: 'the model called list_nodes first',
    matches: result => result.toolCallName === 'list_nodes',
};

describe('classifyLocatorScenarioResult', () => {
    it('classifies a passing result as pass, with no note', () => {
        const result: LocatorScenarioResult = { ...baseResult, pass: true };

        expect(classifyLocatorScenarioResult(result, undefined)).toEqual({ outcome: 'pass' });
    });

    it('classifies an ordinary uncharacterized failure as fail, carrying the error as the note', () => {
        const result: LocatorScenarioResult = {
            ...baseResult,
            pass: false,
            toolCallName: 'move_node',
            error: 'node moved to (300,200), expected (300,150)',
        };

        expect(classifyLocatorScenarioResult(result, undefined)).toEqual({
            outcome: 'fail',
            note: 'node moved to (300,200), expected (300,150)',
        });
    });

    it('classifies a failure matching knownVariance as known-variance, carrying the variance note', () => {
        const result: LocatorScenarioResult = { ...baseResult, pass: false, toolCallName: 'list_nodes' };

        expect(classifyLocatorScenarioResult(result, lookupFirstVariance)).toEqual({
            outcome: 'known-variance',
            note: lookupFirstVariance.note,
        });
    });

    it('classifies a failure with providerError set as provider-error, not fail', () => {
        const result: LocatorScenarioResult = {
            ...baseResult,
            pass: false,
            error: 'Gemini response contained no candidates or no usable content parts (finishReason=SAFETY)',
            providerError: true,
        };

        expect(classifyLocatorScenarioResult(result, undefined)).toEqual({
            outcome: 'provider-error',
            note: 'Gemini response contained no candidates or no usable content parts (finishReason=SAFETY)',
        });
    });

    it('classifies providerError as provider-error even when it would otherwise match knownVariance — provider-error takes priority', () => {
        // A contrived edge case: toolCallName happens to be 'list_nodes' (what the lookup-first
        // variance matches on) AND providerError is set. In practice runLocatorScenario's catch
        // branch always returns toolCallName: null, so this never actually happens — but the
        // classifier must not depend on that never happening to stay correct.
        const result: LocatorScenarioResult = {
            ...baseResult,
            pass: false,
            toolCallName: 'list_nodes',
            error: 'HTTP request failed with status 500',
            providerError: true,
        };

        expect(classifyLocatorScenarioResult(result, lookupFirstVariance)).toEqual({
            outcome: 'provider-error',
            note: 'HTTP request failed with status 500',
        });
    });

    it('never classifies a passing result as anything other than pass, even if providerError is (incorrectly) set', () => {
        // providerError should never be set alongside pass: true per its own contract, but pass
        // must win regardless — defends against a future bug in runLocatorScenario doing so.
        const result: LocatorScenarioResult = { ...baseResult, pass: true, providerError: true };

        expect(classifyLocatorScenarioResult(result, undefined)).toEqual({ outcome: 'pass' });
    });
});

describe('classifyThrownError', () => {
    it('classifies a thrown timeout-race error as timeout', () => {
        const error = new Error(`OpenAI (gpt-4o-mini) move-node-right ${TIMEOUT_MARKER} 30000ms`);

        expect(classifyThrownError(error)).toBe('timeout');
    });

    it('classifies any other thrown error as fail, not timeout', () => {
        expect(classifyThrownError(new Error('network error'))).toBe('fail');
    });

    it('classifies a non-Error thrown value as fail via String() coercion', () => {
        expect(classifyThrownError('a raw string throw')).toBe('fail');
    });
});

describe('isAcceptedOutcome', () => {
    it('accepts pass and known-variance only', () => {
        expect(isAcceptedOutcome('pass')).toBe(true);
        expect(isAcceptedOutcome('known-variance')).toBe(true);
    });

    it('does not accept fail, timeout, or provider-error', () => {
        expect(isAcceptedOutcome('fail')).toBe(false);
        expect(isAcceptedOutcome('timeout')).toBe(false);
        expect(isAcceptedOutcome('provider-error')).toBe(false);
    });
});
