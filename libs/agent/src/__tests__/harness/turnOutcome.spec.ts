import { describe, expect, it } from 'vitest';

import { parseOutcome } from './turnOutcome';

// `parseOutcome` is the eval's outcome extraction: the orchestrator replies in free text that should carry a
// JSON object matching `TurnOutcome`. It must be lenient (fences / surrounding prose / braces inside string
// values) and fall back to `refused` when there's no valid status.
describe('parseOutcome — lenient extraction from the eval re-ask reply', () => {
    it('parses a bare JSON object', () => {
        expect(parseOutcome('{"status":"applied","summary":"moved it"}')).toEqual({
            status: 'applied',
            summary: 'moved it',
        });
    });

    it('parses JSON wrapped in ```json fences', () => {
        const reply = 'Sure:\n```json\n{"status":"answered","answer":"there are 4 nodes"}\n```';
        expect(parseOutcome(reply)).toEqual({ status: 'answered', answer: 'there are 4 nodes' });
    });

    it('parses JSON embedded in surrounding prose', () => {
        const reply = 'The outcome is {"status":"refused","reason":"no such node"} — let me know.';
        expect(parseOutcome(reply)).toEqual({ status: 'refused', reason: 'no such node' });
    });

    it('handles a brace inside a string value (string-aware scan)', () => {
        const reply = '{"status":"refused","reason":"pick gemini-2.5-pro } or a preview model"}';
        expect(parseOutcome(reply)).toEqual({ status: 'refused', reason: 'pick gemini-2.5-pro } or a preview model' });
    });

    it('coerces a partial outcome (applied[] + failed[])', () => {
        const reply =
            '{"status":"partial","summary":"did some","applied":["set model"],"failed":[{"task":"set topK","reason":"not a number"}]}';
        expect(parseOutcome(reply)).toEqual({
            status: 'partial',
            summary: 'did some',
            applied: ['set model'],
            failed: [{ task: 'set topK', reason: 'not a number' }],
        });
    });

    it('falls back to refused when the reply has no JSON', () => {
        expect(parseOutcome('I moved the node to the right.').status).toBe('refused');
    });

    it('falls back to refused when status is missing or invalid', () => {
        expect(parseOutcome('{"summary":"no status here"}').status).toBe('refused');
        expect(parseOutcome('{"status":"bogus"}').status).toBe('refused');
    });

    it('answered/refused fall back to summary when their own field is absent', () => {
        expect(parseOutcome('{"status":"answered","summary":"the answer"}')).toEqual({
            status: 'answered',
            answer: 'the answer',
        });
        expect(parseOutcome('{"status":"refused","summary":"why nothing changed"}')).toEqual({
            status: 'refused',
            reason: 'why nothing changed',
        });
    });
});
