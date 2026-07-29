/**
 * The structured result of a turn. `status` is an enum (robust to phrasing) so the same oracle runs
 * against a real model. Each status carries the invariant the oracle enforces (harness-scenarios.md).
 *
 * There is **no `finish` tool**: production ends a turn with the orchestrator's plain-text message. This
 * type is the shape the EVAL parses an outcome into — `runScenario` re-asks the orchestrator for the
 * turn's outcome as JSON and runs it through {@link parseOutcome}.
 */
export type TurnOutcome =
    | { status: 'applied'; summary: string } // ALL intended changes landed
    | { status: 'partial'; summary: string; applied: string[]; failed: { task: string; reason: string }[] } // some landed, some couldn't
    | { status: 'answered'; answer: string } // pure Q&A, no edits
    | { status: 'refused'; reason: string }; // nothing landed — couldn't act, OR needs a decision from the user

/** A user-facing line derived from a {@link TurnOutcome} (panel / eval scorecard). */
export const outcomeText = (outcome: TurnOutcome): string => {
    switch (outcome.status) {
        case 'applied':
            return outcome.summary;
        case 'partial': {
            const couldnt = outcome.failed.map(f => `${f.task} (${f.reason})`).join('; ');
            return couldnt ? `${outcome.summary}\nCouldn’t: ${couldnt}` : outcome.summary;
        }
        case 'answered':
            return outcome.answer;
        case 'refused':
            return outcome.reason;
    }
};

/** Pull the first balanced JSON object out of free text (tolerates ```json fences + surrounding prose). */
const extractJsonObject = (text: string): Record<string, unknown> | undefined => {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1] : text;
    const start = candidate.indexOf('{');
    if (start === -1) return undefined;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < candidate.length; i += 1) {
        const ch = candidate[i];
        // Skip string contents so a brace inside a value (e.g. a `reason` containing `}`) doesn't miscount.
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') inString = true;
        else if (ch === '{') depth += 1;
        else if (ch === '}') {
            depth -= 1;
            if (depth === 0) {
                try {
                    const parsed: unknown = JSON.parse(candidate.slice(start, i + 1));
                    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                        ? (parsed as Record<string, unknown>)
                        : undefined;
                } catch {
                    return undefined;
                }
            }
        }
    }
    return undefined;
};

/**
 * Parse the eval's re-ask reply into a {@link TurnOutcome}. LENIENT by design: the orchestrator replies in
 * free text that should contain a JSON object matching `TurnOutcome`; this extracts + validates it and
 * coerces missing fields. A reply with no valid status falls back to `refused` (nothing landed — the report
 * was unparseable). TEST-ONLY: production neither produces nor parses an outcome.
 */
export const parseOutcome = (text: string): TurnOutcome => {
    const obj = extractJsonObject(text) ?? {};
    const status = typeof obj.status === 'string' ? obj.status : '';
    const str = (v: unknown): string => (typeof v === 'string' ? v : '');
    switch (status) {
        case 'applied':
            return { status: 'applied', summary: str(obj.summary) };
        case 'partial': {
            const applied = Array.isArray(obj.applied)
                ? obj.applied.filter((x): x is string => typeof x === 'string')
                : [];
            const failed = Array.isArray(obj.failed)
                ? obj.failed
                      .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object' && !Array.isArray(f))
                      .map(f => ({ task: str(f.task), reason: str(f.reason) }))
                : [];
            return { status: 'partial', summary: str(obj.summary), applied, failed };
        }
        case 'answered':
            return { status: 'answered', answer: str(obj.answer) || str(obj.summary) };
        case 'refused':
            return { status: 'refused', reason: str(obj.reason) || str(obj.summary) };
        default:
            return { status: 'refused', reason: `no parseable outcome: ${text.trim().slice(0, 200)}` };
    }
};
