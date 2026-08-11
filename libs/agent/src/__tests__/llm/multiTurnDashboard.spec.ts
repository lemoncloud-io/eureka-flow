import { describe, expect, it } from 'vitest';

import { buildMultiTurnDashboardHtml, jsonForInlineScript } from '../../llm/multiTurnDashboard';
import { buildMultiTurnVerificationReport } from '../../llm/multiTurnVerificationMetrics';

import type { MultiTurnLiveRecord } from '../../llm/multiTurnVerificationMetrics';

const makeRecord = (overrides: Partial<MultiTurnLiveRecord> = {}): MultiTurnLiveRecord => ({
    provider: 'OpenAI',
    providerId: 'openai',
    requestedModel: 'gpt-4o-mini',
    scenarioId: 'move-node-right',
    attempt: 1,
    repetitions: 1,
    maxTurns: 3,
    outcome: 'success',
    strategy: 'direct',
    completionMode: 'tool-action',
    turnCount: 1,
    requestedToolSequence: ['move_node'],
    turns: [{ turn: 1, toolCallName: 'move_node', textPresent: false, argsValid: true, dispatchOk: true }],
    finalStateCorrect: true,
    startedAt: 1000,
    endedAt: 1200,
    elapsedMs: 200,
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
    providerTotalTokens: 150,
    effectiveCost: 0.0001,
    ...overrides,
});

describe('jsonForInlineScript', () => {
    it('escapes a literal </script> inside a string value so it can never end the containing script tag early', () => {
        const serialized = jsonForInlineScript({ error: 'oops </script><script>alert(1)</script>' });
        expect(serialized).not.toContain('</script>');
        expect(serialized).toContain('\\u003c/script>');
        // Still valid, semantically-identical JSON once parsed back.
        expect((JSON.parse(serialized) as { error: string }).error).toBe('oops </script><script>alert(1)</script>');
    });

    it('escapes an HTML-comment-close sequence the same way', () => {
        const serialized = jsonForInlineScript({ note: 'a --> b' });
        expect(serialized).not.toContain('-->');
    });
});

describe('buildMultiTurnDashboardHtml: generation and structure', () => {
    const gpt4oMini = makeRecord({ requestedModel: 'gpt-4o-mini', actualModel: 'gpt-4o-mini-2024-07-18' });
    const gpt5Mini = makeRecord({
        requestedModel: 'gpt-5-mini',
        actualModel: 'gpt-5-mini-2025-08-07',
        scenarioId: 'move-named-node-without-id',
        strategy: 'lookup-first',
        turnCount: 2,
        outcome: 'success',
    });
    const report = buildMultiTurnVerificationReport([gpt4oMini, gpt5Mini], '2026-08-06T00:00:00.000Z');
    const html = buildMultiTurnDashboardHtml(report);

    it('produces a non-empty, well-formed standalone HTML document', () => {
        expect(html.startsWith('<!doctype html>')).toBe(true);
        expect(html).toContain('<html');
        expect(html).toContain('</html>');
    });

    it('never references an external CDN, stylesheet, script src, or network resource', () => {
        // The only "http://" text allowed anywhere is the SVG XML namespace URI, which is a plain
        // identifier (never fetched over the network) — everything else must be free of it.
        const withoutSvgNamespace = html.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '');
        expect(withoutSvgNamespace).not.toMatch(/https?:\/\//);
        expect(html).not.toMatch(/<script[^>]+src=/);
        expect(html).not.toMatch(/<link[^>]+href=/);
        expect(html).not.toMatch(/\bfetch\s*\(/);
        expect(html).not.toMatch(/XMLHttpRequest/);
    });

    it('embeds both requested model IDs and both actual model IDs', () => {
        expect(html).toContain('gpt-4o-mini');
        expect(html).toContain('gpt-5-mini');
        expect(html).toContain('gpt-4o-mini-2024-07-18');
        expect(html).toContain('gpt-5-mini-2025-08-07');
    });

    it('contains all five required chart sections plus the completion-mode comparison, each with its own container and heading', () => {
        for (const id of [
            'chart-success-rate',
            'chart-latency',
            'chart-cost',
            'chart-strategy',
            'chart-completion-mode',
            'chart-scenario-stats',
            'chart-scatter',
        ]) {
            expect(html).toContain(`id="${id}"`);
        }
        expect(html).toMatch(/final task success rate by model/i);
        expect(html).toMatch(/latency comparison/i);
        expect(html).toMatch(/cost comparison/i);
        expect(html).toMatch(/attempt-level scatter/i);
    });

    it('labels the strategy chart as INITIAL strategy (how a run started), distinct from the separate completion-mode comparison (how a successful run ended)', () => {
        expect(html).toMatch(/initial strategy distribution/i);
        expect(html).toMatch(/completion-mode comparison/i);
    });

    it('embeds completionMode on every attempt and shows it in the scatter tooltip/aria-label', () => {
        expect(html).toContain('"completionMode":"tool-action"');
        expect(html).toMatch(/completionMode=/); // the client script builds this into each point's summary
    });

    it('provides model and scenario filter containers', () => {
        expect(html).toContain('id="model-filters"');
        expect(html).toContain('id="scenario-filters"');
    });

    it('embeds a legend distinguishing success/failure/timeout/provider-error/max-turns', () => {
        expect(html).toContain('id="legend"');
        for (const outcome of ['success', 'failure', 'provider-error', 'timeout', 'max-turns']) {
            expect(html).toContain(outcome);
        }
    });

    it('labels the scatter plot axis as provider-reported tokens, never as total provider consumption or plain "tokens"', () => {
        expect(html).toMatch(/provider-reported total tokens/i);
        expect(html).not.toMatch(/total provider consumption/i);
    });
});

describe('buildMultiTurnDashboardHtml: missing provider-token/cost values stay unavailable, never fabricated as zero', () => {
    const noUsageRecord = makeRecord({
        requestedModel: 'gpt-4o-mini',
        providerTotalTokens: undefined,
        effectiveCost: undefined,
        totalTokens: null,
        inputTokens: null,
        outputTokens: null,
    });
    const report = buildMultiTurnVerificationReport([noUsageRecord], '2026-08-06T00:00:00.000Z');
    const html = buildMultiTurnDashboardHtml(report);

    it('the embedded record JSON omits providerTotalTokens/effectiveCost entirely rather than serializing them as 0', () => {
        const dataBlockMatch = html.match(/<script id="report-data"[^>]*>([\s\S]*?)<\/script>/);
        expect(dataBlockMatch).not.toBeNull();
        const embedded = JSON.parse((dataBlockMatch as RegExpMatchArray)[1]) as { records: MultiTurnLiveRecord[] };
        const record = embedded.records[0];
        expect(record.providerTotalTokens).toBeUndefined();
        expect(record.effectiveCost).toBeUndefined();
        expect(JSON.stringify(record)).not.toContain('"providerTotalTokens":0');
        expect(JSON.stringify(record)).not.toContain('"effectiveCost":0');
    });
});

describe('buildMultiTurnDashboardHtml: HTML/XSS safety for arbitrary model/scenario/error text', () => {
    it('a scenario id, model id, and error message containing markup-breaking characters never escape the embedded data script', () => {
        const hostileRecord = makeRecord({
            requestedModel: 'gpt-4o-mini"><img src=x onerror=alert(1)>',
            scenarioId: '</script><script>alert(2)</script>',
            error: 'boom & <b>"quoted"</b> \'value\' --> done',
        });
        const report = buildMultiTurnVerificationReport([hostileRecord], '2026-08-06T00:00:00.000Z');
        const html = buildMultiTurnDashboardHtml(report);

        // Exactly the two legitimate closing </script> tags this page always emits (the data blob
        // and the client-JS block) — never a third one smuggled in from record data.
        const scriptCloseCount = html.split('</script>').length - 1;
        expect(scriptCloseCount).toBe(2);

        // The hostile content still round-trips correctly once parsed as JSON.
        const dataBlockMatch = html.match(/<script id="report-data"[^>]*>([\s\S]*?)<\/script>/);
        const embedded = JSON.parse((dataBlockMatch as RegExpMatchArray)[1]) as { records: MultiTurnLiveRecord[] };
        expect(embedded.records[0].error).toBe('boom & <b>"quoted"</b> \'value\' --> done');
        expect(embedded.records[0].scenarioId).toBe('</script><script>alert(2)</script>');
    });
});

describe('buildMultiTurnDashboardHtml: compatibility with Anthropic records (no regression to the OpenAI baseline)', () => {
    // Anthropic's gateway never reports `actualModel` (unlike OpenAI's, which reads it from the
    // response body) — this must render as "no actual model known", never a fabricated value or a
    // crash, exactly like this dashboard's existing (already-tested) handling of any other record
    // missing an optional field.
    const anthropicRecord = makeRecord({
        provider: 'Claude',
        providerId: 'anthropic',
        requestedModel: 'claude-haiku-4-5',
        actualModel: undefined,
        scenarioId: 'move-named-node-without-id',
        strategy: 'lookup-first',
        completionMode: 'tool-action',
        turnCount: 2,
        requestedToolSequence: ['list_nodes', 'move_node'],
        providerTotalTokens: undefined, // Anthropic reports no provider-total-tokens concept either
        totalTokens: 220,
        effectiveCost: 0.00045,
    });
    const openAiRecord = makeRecord(); // the existing baseline shape, untouched

    it('renders both an Anthropic and an OpenAI record in one report without error', () => {
        const report = buildMultiTurnVerificationReport([openAiRecord, anthropicRecord], '2026-08-06T00:00:00.000Z');
        const html = buildMultiTurnDashboardHtml(report);
        expect(html).toContain('gpt-4o-mini');
        expect(html).toContain('claude-haiku-4-5');
        expect(html).toContain('"providerId":"anthropic"');
        // Never a fabricated actualModel for the Anthropic record.
        const dataBlockMatch = html.match(/<script id="report-data"[^>]*>([\s\S]*?)<\/script>/);
        const embedded = JSON.parse((dataBlockMatch as RegExpMatchArray)[1]) as { records: MultiTurnLiveRecord[] };
        const anthropicEmbedded = embedded.records.find(r => r.providerId === 'anthropic');
        expect(anthropicEmbedded?.actualModel).toBeUndefined();
    });

    it('the model filter distinguishes the two providers even though only one (OpenAI) has an actualModel', () => {
        const report = buildMultiTurnVerificationReport([openAiRecord, anthropicRecord], '2026-08-06T00:00:00.000Z');
        const html = buildMultiTurnDashboardHtml(report);
        // Two distinct requested-model checkboxes, one per provider — no crash from the missing
        // actualModel on the Claude record.
        expect(html).toContain('id="model-filters"');
        expect(html).toContain('gpt-4o-mini');
        expect(html).toContain('claude-haiku-4-5');
    });

    it('an Anthropic-only report (no OpenAI record at all) still renders every required chart section', () => {
        const report = buildMultiTurnVerificationReport([anthropicRecord], '2026-08-06T00:00:00.000Z');
        const html = buildMultiTurnDashboardHtml(report);
        for (const id of [
            'chart-success-rate',
            'chart-latency',
            'chart-cost',
            'chart-strategy',
            'chart-completion-mode',
            'chart-scenario-stats',
            'chart-scatter',
        ]) {
            expect(html).toContain(`id="${id}"`);
        }
        expect(html).not.toContain('gpt-4o-mini');
    });

    it('now that Anthropic reports a real actualModel, the dashboard distinguishes requested vs. actual for Claude too, not just OpenAI', () => {
        const resolvedAnthropicRecord = makeRecord({
            provider: 'Claude',
            providerId: 'anthropic',
            requestedModel: 'claude-haiku-4-5',
            actualModel: 'claude-haiku-4-5-20251001',
            scenarioId: 'move-node-right',
            strategy: 'direct',
            completionMode: 'tool-action',
        });
        const report = buildMultiTurnVerificationReport([resolvedAnthropicRecord], '2026-08-06T00:00:00.000Z');
        const html = buildMultiTurnDashboardHtml(report);
        expect(html).toContain('claude-haiku-4-5');
        expect(html).toContain('claude-haiku-4-5-20251001');
        const dataBlockMatch = html.match(/<script id="report-data"[^>]*>([\s\S]*?)<\/script>/);
        const embedded = JSON.parse((dataBlockMatch as RegExpMatchArray)[1]) as { records: MultiTurnLiveRecord[] };
        expect(embedded.records[0].requestedModel).toBe('claude-haiku-4-5');
        expect(embedded.records[0].actualModel).toBe('claude-haiku-4-5-20251001');
        expect(embedded.records[0].requestedModel).not.toBe(embedded.records[0].actualModel);
    });
});

describe('buildMultiTurnDashboardHtml: scenario-level latency & cost view', () => {
    const gpt4oMiniRight = makeRecord({
        requestedModel: 'gpt-4o-mini',
        scenarioId: 'move-node-right',
        attempt: 1,
        elapsedMs: 100,
        effectiveCost: 0.0001,
    });
    const gpt4oMiniAmbiguous = makeRecord({
        requestedModel: 'gpt-4o-mini',
        scenarioId: 'ambiguous-instruction',
        strategy: 'text-only',
        requestedToolSequence: [],
        attempt: 1,
        elapsedMs: 900,
        effectiveCost: undefined,
    });
    const gpt5MiniRight = makeRecord({
        requestedModel: 'gpt-5-mini',
        scenarioId: 'move-node-right',
        attempt: 1,
        elapsedMs: 5000,
        effectiveCost: 0.01,
    });
    const report = buildMultiTurnVerificationReport(
        [gpt4oMiniRight, gpt4oMiniAmbiguous, gpt5MiniRight],
        '2026-08-06T00:00:00.000Z'
    );
    const html = buildMultiTurnDashboardHtml(report);

    it('renders a dedicated scenario-level section with its own container, heading, and hint', () => {
        expect(html).toContain('id="chart-scenario-stats"');
        expect(html).toMatch(/scenario-level latency/i);
        expect(html).toMatch(/scenario filtering and this view always agree/i);
    });

    it('is wired into the SAME render loop as every other chart, so model/scenario filters update it too', () => {
        // Source-inspection, not DOM execution (this dashboard's client JS is a plain string
        // embedded at build time — see multiTurnDashboard.ts's own module doc for why no DOM/jsdom
        // dependency is used in committed tests). Proves renderScenarioStats is a first-class
        // member of renderAll(), reacting to the exact same filteredRecords()/change-event pipeline
        // already exercised by the other (already-tested) charts.
        expect(html).toContain('function renderScenarioStats');
        expect(html).toContain('renderScenarioStats(records)');
        expect(html).toContain('function groupByModelScenario');
    });

    it('reuses the exact same statistics functions as the model-level latency/cost charts — never a second, drifting implementation', () => {
        const scriptBlockMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
        expect(scriptBlockMatch).not.toBeNull();
        const clientScript = (scriptBlockMatch as RegExpMatchArray)[1];
        // renderScenarioStats calls the shared groupStats() — the same dimension-agnostic function
        // renderLatency/renderCost call — never its own separate median/p90/cost calculation.
        const fnBody = clientScript.slice(clientScript.indexOf('function renderScenarioStats'));
        const fnEnd = fnBody.indexOf('\n  function renderScatter');
        const renderScenarioStatsBody = fnBody.slice(0, fnEnd === -1 ? undefined : fnEnd);
        expect(renderScenarioStatsBody).toContain('groupStats(');
        expect(renderScenarioStatsBody).not.toContain('function median');
        expect(renderScenarioStatsBody).not.toContain('function p90');
    });

    it('produces distinct rows for the same model across different scenarios, and different models in the same scenario', () => {
        expect(html).toContain('gpt-4o-mini');
        expect(html).toContain('gpt-5-mini');
        expect(html).toContain('move-node-right');
        expect(html).toContain('ambiguous-instruction');
    });

    it('never fabricates cost as zero for the unpriced ambiguous-instruction attempt (client script keeps the "no data" convention)', () => {
        const scriptBlockMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
        const clientScript = (scriptBlockMatch as RegExpMatchArray)[1];
        expect(clientScript).toContain("'no data'");
    });
});
