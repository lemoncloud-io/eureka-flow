import type { MultiTurnVerificationReport } from './multiTurnVerificationMetrics';

/**
 * Self-contained, offline HTML comparison dashboard for a multi-turn live run — `latest.html`,
 * written by `realMultiTurnLocatorScenarios.spec.ts` alongside its existing `latest.md/json/csv/jsonl`
 * and `run-manifest.json`. No new dependency: the whole page (markup, CSS, and the chart-rendering
 * logic) is plain, hand-written HTML/CSS/SVG/JavaScript, embedded as static string constants in this
 * module — the same "no chart-rendering dependency" choice `verificationMetrics.ts` already made for
 * the single-turn benchmark's quadrant chart (see its `buildElapsedVsTokensSvg` doc). It needs no
 * network access and no external CDN resource to open and use locally.
 *
 * The full {@link MultiTurnVerificationReport} (every record, plus the already-computed model/
 * scenario summaries) is embedded as one JSON blob; ALL chart math (grouping, success/strategy
 * counts, median/P90 elapsed, cost coverage) is then recomputed client-side, live, from whichever
 * subset of `records` the model/scenario filters currently select — the pre-computed
 * `modelSummaries`/`scenarioSummaries` describe only the UNFILTERED "every attempt" view and would
 * go stale the moment a filter narrows the record set, so the charts never read them directly.
 * `records` alone has everything (provider, requestedModel, actualModel, scenarioId, outcome,
 * strategy, elapsedMs, tokens, effectiveCost) needed to rebuild every view from scratch for any
 * filter combination.
 *
 * Every dynamic value that reaches the DOM does so via `textContent`/`setAttribute`/
 * `createElementNS` — never `innerHTML` with interpolated report data — so a model id, scenario id,
 * or error message containing `<`, `>`, `&`, or quotes can never break page structure or execute as
 * markup/script. The one place report data is not inert DOM text is the embedded JSON blob itself;
 * {@link jsonForInlineScript} neutralizes the one way JSON content could otherwise escape its
 * `<script>` container (a literal `</script>` or `-->` substring inside a string value, e.g. an
 * error message).
 */

const escapeHtml = (value: string): string =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * Serializes `value` for safe embedding inside `<script type="application/json">...</script>`.
 * `JSON.stringify` never emits raw `<` normally, but a string VALUE inside the data (e.g. a
 * scenario prompt, an error message, or a maliciously-crafted model id) could legitimately contain
 * the literal text `</script>` or `-->` — either would otherwise end the script/comment early and
 * corrupt the page. Escaping every `<` as `\u003c` (valid inside a JS/JSON string, semantically
 * identical once parsed) is the standard fix; `-->` is neutralized the same way as defense in depth
 * against the same class of issue inside an HTML comment.
 */
export const jsonForInlineScript = (value: unknown): string =>
    JSON.stringify(value).replace(/</g, '\\u003c').replace(/-->/g, '--\\u003e');

const CSS = `
:root {
  color-scheme: light dark;
  --success: #16a34a;
  --failure: #dc2626;
  --provider-error: #7c3aed;
  --timeout: #ea580c;
  --max-turns: #2563eb;
  --direct: #16a34a;
  --lookup-first: #2563eb;
  --text-only: #ca8a04;
  --other: #6b7280;
  --border: #8888882e;
  --bg: canvas;
  --fg: canvastext;
}
* { box-sizing: border-box; }
body {
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  margin: 0;
  padding: 1.5rem;
  max-width: 1200px;
  margin-inline: auto;
  color: var(--fg);
  background: var(--bg);
  line-height: 1.45;
}
h1 { font-size: 1.4rem; margin-bottom: 0.25rem; }
h2 { font-size: 1.05rem; margin: 0 0 0.25rem; }
.meta { color: #6b7280; font-size: 0.9rem; margin-top: 0; }
.hint { color: #6b7280; font-size: 0.85rem; margin: 0 0 0.75rem; }
fieldset { border: 1px solid var(--border); border-radius: 8px; padding: 0.5rem 0.75rem; margin: 0; }
legend { font-weight: 600; font-size: 0.85rem; padding: 0 0.3rem; }
#filters { display: flex; flex-wrap: wrap; gap: 1rem; margin: 1rem 0; }
.filter-option { display: inline-flex; align-items: center; gap: 0.3rem; margin: 0.15rem 0.6rem 0.15rem 0; font-size: 0.9rem; }
.filter-option input { width: 1rem; height: 1rem; }
#legend { display: flex; flex-wrap: wrap; gap: 0.9rem; margin-bottom: 1rem; font-size: 0.85rem; }
.legend-swatch { display: inline-block; width: 0.75rem; height: 0.75rem; border-radius: 3px; margin-right: 0.35rem; vertical-align: -1px; }
.chart-section { border: 1px solid var(--border); border-radius: 10px; padding: 1rem 1.1rem; margin-bottom: 1.25rem; }
.chart-body { overflow-x: auto; }
.bar-row { display: flex; align-items: center; gap: 0.6rem; margin: 0.35rem 0; font-size: 0.85rem; }
.bar-row .row-label { flex: 0 0 220px; overflow-wrap: anywhere; }
.bar-row .row-label .actual { color: #6b7280; font-size: 0.78rem; display: block; }
.bar-track { position: relative; flex: 1 1 auto; min-width: 180px; height: 1.4rem; background: #8888881a; border-radius: 4px; overflow: hidden; }
.bar-seg { position: absolute; top: 0; bottom: 0; }
.bar-value { flex: 0 0 auto; font-variant-numeric: tabular-nums; font-size: 0.8rem; min-width: 130px; }
.no-data { color: #6b7280; font-style: italic; }
.partial-flag { color: #b45309; font-weight: 600; }
.details-panel { margin-top: 0.75rem; padding: 0.6rem 0.75rem; border: 1px dashed var(--border); border-radius: 8px; font-size: 0.85rem; white-space: pre-line; }
svg text { fill: var(--fg); }
svg.scatter { width: 100%; height: 420px; }
circle:focus { outline: 2px solid #2563eb; outline-offset: 2px; }
table.excluded { font-size: 0.8rem; border-collapse: collapse; margin-top: 0.5rem; }
table.excluded td, table.excluded th { padding: 0.15rem 0.5rem; text-align: left; }
@media (prefers-color-scheme: dark) {
  .bar-track { background: #ffffff1a; }
}
`;

/**
 * Hand-written client-side JavaScript, embedded verbatim. Deliberately plain ES5-flavored syntax
 * (`function`, `var`) rather than modern TS-transpiled output, since this string is never run
 * through the project's TypeScript/bundler pipeline — it has to be valid, standalone JavaScript
 * exactly as written here, executed directly by whatever browser opens the file.
 */
const CLIENT_JS = `
(function () {
  'use strict';

  var DATA = JSON.parse(document.getElementById('report-data').textContent);
  var RECORDS = DATA.records || [];

  var OUTCOME_COLORS = {
    success: 'var(--success)',
    failure: 'var(--failure)',
    'provider-error': 'var(--provider-error)',
    timeout: 'var(--timeout)',
    'max-turns': 'var(--max-turns)'
  };
  var OUTCOME_ORDER = ['success', 'failure', 'provider-error', 'timeout', 'max-turns'];
  var STRATEGY_COLORS = { direct: 'var(--direct)', 'lookup-first': 'var(--lookup-first)', 'text-only': 'var(--text-only)', other: 'var(--other)' };
  var STRATEGY_ORDER = ['direct', 'lookup-first', 'text-only', 'other'];

  // ---- pure stats helpers — mirror multiTurnVerificationMetrics.ts's mean/median/p90NearestRank/
  // successRate/costPerSuccessfulTask semantics exactly, so filtering client-side never implies a
  // different definition of "median" or "P90" than the one used server-side for the unfiltered view.
  function mean(values) {
    if (values.length === 0) return null;
    var sum = 0;
    for (var i = 0; i < values.length; i++) sum += values[i];
    return sum / values.length;
  }
  function median(values) {
    if (values.length === 0) return null;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }
  function p90(values) {
    if (values.length === 0) return null;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var rank = Math.ceil(0.9 * sorted.length);
    var index = Math.min(Math.max(rank, 1), sorted.length) - 1;
    return sorted[index];
  }
  function successRate(successCount, totalCount) {
    return totalCount === 0 ? null : successCount / totalCount;
  }

  function escText(el, text) { el.textContent = text; return el; }
  function h(tag, attrs, text) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) el.setAttribute(k, attrs[k]);
    if (text !== undefined) escText(el, text);
    return el;
  }
  var SVG_NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) el.setAttribute(k, attrs[k]);
    return el;
  }

  function modelKey(r) { return r.provider + '\\u0000' + r.requestedModel; }

  // ---- filters state ---------------------------------------------------------------------------
  var allModelKeys = [];
  var modelLabels = {};
  var actualModelsByKey = {};
  var allScenarios = [];
  (function collectFilterOptions() {
    var seenModel = {};
    var seenScenario = {};
    RECORDS.forEach(function (r) {
      var key = modelKey(r);
      if (!seenModel[key]) {
        seenModel[key] = true;
        allModelKeys.push(key);
        modelLabels[key] = r.provider + ' / ' + r.requestedModel;
        actualModelsByKey[key] = {};
      }
      if (r.actualModel) actualModelsByKey[key][r.actualModel] = true;
      if (!seenScenario[r.scenarioId]) { seenScenario[r.scenarioId] = true; allScenarios.push(r.scenarioId); }
    });
  })();

  var selectedModels = {};
  allModelKeys.forEach(function (k) { selectedModels[k] = true; });
  var selectedScenarios = {};
  allScenarios.forEach(function (s) { selectedScenarios[s] = true; });

  function filteredRecords() {
    return RECORDS.filter(function (r) { return selectedModels[modelKey(r)] && selectedScenarios[r.scenarioId]; });
  }

  // ---- header -------------------------------------------------------------------------------
  escText(document.getElementById('generated-at'), DATA.generatedAt || '(unknown)');
  escText(document.getElementById('cost-currency'), DATA.costCurrency || '(unknown)');

  // ---- filter UI ------------------------------------------------------------------------------
  function buildFilterUI(containerId, keys, labelFor, selectedMap) {
    var container = document.getElementById(containerId);
    keys.forEach(function (key) {
      var id = containerId + '-' + key.replace(/[^a-zA-Z0-9]/g, '_');
      var wrap = h('label', { 'class': 'filter-option', 'for': id });
      var input = h('input', { type: 'checkbox', id: id });
      input.checked = true;
      input.addEventListener('change', function () {
        selectedMap[key] = input.checked;
        renderAll();
      });
      wrap.appendChild(input);
      wrap.appendChild(document.createTextNode(labelFor(key)));
      container.appendChild(wrap);
    });
  }
  buildFilterUI('model-filters', allModelKeys, function (key) {
    var actuals = Object.keys(actualModelsByKey[key]);
    return modelLabels[key] + (actuals.length ? ' (actual: ' + actuals.join(', ') + ')' : '');
  }, selectedModels);
  buildFilterUI('scenario-filters', allScenarios, function (s) { return s; }, selectedScenarios);

  // ---- legend ---------------------------------------------------------------------------------
  (function buildLegend() {
    var el = document.getElementById('legend');
    OUTCOME_ORDER.forEach(function (outcome) {
      var item = h('span', {});
      var swatch = h('span', { 'class': 'legend-swatch', style: 'background:' + OUTCOME_COLORS[outcome] });
      item.appendChild(swatch);
      item.appendChild(document.createTextNode(outcome));
      el.appendChild(item);
    });
  })();

  // ---- grouping ------------------------------------------------------------------------------
  function groupByModel(records) {
    var map = {};
    var order = [];
    records.forEach(function (r) {
      var key = modelKey(r);
      if (!map[key]) { map[key] = { key: key, provider: r.provider, requestedModel: r.requestedModel, actualModels: {}, records: [] }; order.push(key); }
      map[key].records.push(r);
      if (r.actualModel) map[key].actualModels[r.actualModel] = true;
    });
    return order.map(function (k) { return map[k]; });
  }

  function groupStats(group) {
    var records = group.records;
    var attempts = records.length;
    var successRecords = records.filter(function (r) { return r.outcome === 'success'; });
    var direct = successRecords.filter(function (r) { return r.strategy === 'direct'; }).length;
    var lookupFirst = successRecords.filter(function (r) { return r.strategy === 'lookup-first'; }).length;
    var textOnly = successRecords.filter(function (r) { return r.strategy === 'text-only'; }).length;
    var otherSuccess = successRecords.length - direct - lookupFirst - textOnly;

    var elapsedValues = records.map(function (r) { return r.elapsedMs; }).filter(function (v) { return typeof v === 'number'; });
    var pricedValues = records.map(function (r) { return r.effectiveCost; }).filter(function (v) { return typeof v === 'number'; });
    var totalKnownCost = pricedValues.length > 0 ? pricedValues.reduce(function (a, b) { return a + b; }, 0) : null;
    var costPerSuccessfulTask = successRecords.length === 0 || totalKnownCost === null ? null : totalKnownCost / successRecords.length;

    var strategyCounts = { direct: 0, 'lookup-first': 0, 'text-only': 0, other: 0 };
    records.forEach(function (r) {
      if (Object.prototype.hasOwnProperty.call(strategyCounts, r.strategy)) strategyCounts[r.strategy] += 1;
      else strategyCounts.other += 1;
    });

    // completionMode is a field already present on every record (computed server-side by
    // classifyCompletionMode in verifyLocatorScenarios.ts) — read directly, never re-derived here.
    var toolActionSuccesses = records.filter(function (r) { return r.completionMode === 'tool-action'; }).length;
    var textResponseSuccesses = records.filter(function (r) { return r.completionMode === 'text-response'; }).length;
    var incompleteAttempts = attempts - successRecords.length;
    var successfulLookupActionRoundTrips = records.filter(isSuccessfulLookupActionRoundTrip).length;

    return {
      key: group.key,
      provider: group.provider,
      requestedModel: group.requestedModel,
      actualModels: Object.keys(group.actualModels),
      attempts: attempts,
      successes: successRecords.length,
      direct: direct, lookupFirst: lookupFirst, textOnly: textOnly, otherSuccess: otherSuccess,
      finalSuccessRate: successRate(successRecords.length, attempts),
      medianElapsedMs: median(elapsedValues),
      p90ElapsedMs: p90(elapsedValues),
      elapsedCoverage: elapsedValues.length + '/' + attempts,
      averageKnownCostPerPricedAttempt: mean(pricedValues),
      costPerSuccessfulTask: costPerSuccessfulTask,
      costCoverageRate: successRate(pricedValues.length, attempts),
      costPartial: pricedValues.length < attempts,
      strategyCounts: strategyCounts,
      toolActionSuccesses: toolActionSuccesses,
      textResponseSuccesses: textResponseSuccesses,
      incompleteAttempts: incompleteAttempts,
      successfulLookupActionRoundTrips: successfulLookupActionRoundTrips
    };
  }

  // Mirrors multiTurnVerificationMetrics.ts's isSuccessfulLookupActionRoundTrip exactly (see that
  // function's own doc for the four-part definition) — a genuine list_nodes -> tool result ->
  // LATER non-list_nodes action-tool round trip that also succeeded.
  function isSuccessfulLookupActionRoundTrip(r) {
    if (r.outcome !== 'success') return false;
    if (r.strategy !== 'lookup-first') return false;
    if (r.completionMode !== 'tool-action') return false;
    var seq = r.requestedToolSequence || [];
    if (seq[0] !== 'list_nodes') return false;
    for (var i = 1; i < seq.length; i++) {
      if (seq[i] !== 'list_nodes') return true;
    }
    return false;
  }

  // ---- generic bar helpers ---------------------------------------------------------------------
  function fmtMs(v) { return v === null || v === undefined ? null : Math.round(v) + ' ms'; }
  function fmtCost(v) { return v === null || v === undefined ? null : DATA.costCurrency + ' ' + v.toFixed(6); }
  function fmtPct(v) { return v === null || v === undefined ? null : Math.round(v * 1000) / 10 + '%'; }

  function renderStackedRow(container, label, subLabel, segments, totalDenominator) {
    var row = h('div', { 'class': 'bar-row' });
    var labelEl = h('div', { 'class': 'row-label' });
    labelEl.appendChild(document.createTextNode(label));
    if (subLabel) labelEl.appendChild(h('span', { 'class': 'actual' }, subLabel));
    row.appendChild(labelEl);

    var track = h('div', { 'class': 'bar-track' });
    var offsetPct = 0;
    segments.forEach(function (seg) {
      if (seg.value <= 0) return;
      var pct = totalDenominator > 0 ? (seg.value / totalDenominator) * 100 : 0;
      var el = h('div', { 'class': 'bar-seg', style: 'left:' + offsetPct + '%;width:' + pct + '%;background:' + seg.color, title: seg.label + ': ' + seg.value });
      track.appendChild(el);
      offsetPct += pct;
    });
    row.appendChild(track);

    var valueEl = h('div', { 'class': 'bar-value' });
    valueEl.textContent = segments.map(function (s) { return s.label + '=' + s.value; }).join(', ');
    row.appendChild(valueEl);
    container.appendChild(row);
  }

  function renderScaledBarsRow(container, label, subLabel, bars, maxValue, formatValue) {
    var row = h('div', { 'class': 'bar-row' });
    var labelEl = h('div', { 'class': 'row-label' });
    labelEl.appendChild(document.createTextNode(label));
    if (subLabel) labelEl.appendChild(h('span', { 'class': 'actual' }, subLabel));
    row.appendChild(labelEl);

    var track = h('div', { 'class': 'bar-track', style: 'display:flex;gap:2px;background:none;' });
    var valueEl = h('div', { 'class': 'bar-value' });
    var parts = [];
    bars.forEach(function (bar) {
      var mini = h('div', { style: 'flex:1;height:1.4rem;background:#8888881a;border-radius:4px;position:relative;overflow:hidden;' });
      if (bar.value === null || bar.value === undefined) {
        mini.appendChild(h('span', { style: 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:0.72rem;', 'class': 'no-data' }, 'no data'));
        parts.push(bar.label + '=no data');
      } else {
        var pct = maxValue > 0 ? Math.max(2, (bar.value / maxValue) * 100) : 0;
        mini.appendChild(h('div', { style: 'position:absolute;left:0;top:0;bottom:0;width:' + pct + '%;background:' + bar.color, title: bar.label + ': ' + formatValue(bar.value) }));
        parts.push(bar.label + '=' + formatValue(bar.value));
      }
      track.appendChild(mini);
    });
    row.appendChild(track);
    valueEl.textContent = parts.join(', ');
    row.appendChild(valueEl);
    container.appendChild(row);
  }

  // ---- chart 1: final success rate by model ----------------------------------------------------
  function renderSuccessRate(groups) {
    var body = document.querySelector('#chart-success-rate .chart-body');
    body.innerHTML = '';
    if (groups.length === 0) { body.appendChild(h('p', { 'class': 'no-data' }, 'No attempts match the current filters.')); return; }
    groups.forEach(function (g) {
      var s = groupStats(g);
      var segments = [
        { value: s.direct, color: STRATEGY_COLORS.direct, label: 'direct' },
        { value: s.lookupFirst, color: STRATEGY_COLORS['lookup-first'], label: 'lookup-first' },
        { value: s.textOnly, color: STRATEGY_COLORS['text-only'], label: 'text-only' },
        { value: s.otherSuccess, color: STRATEGY_COLORS.other, label: 'other-success' }
      ];
      var subLabel = 'n=' + s.attempts + (s.actualModels.length ? ' · actual: ' + s.actualModels.join(', ') : '');
      renderStackedRow(body, g.provider + ' / ' + g.requestedModel, subLabel + ' · rate=' + (fmtPct(s.finalSuccessRate) || 'n/a'), segments, s.attempts);
    });
  }

  // ---- chart 2: latency ------------------------------------------------------------------------
  function renderLatency(groups) {
    var body = document.querySelector('#chart-latency .chart-body');
    body.innerHTML = '';
    if (groups.length === 0) { body.appendChild(h('p', { 'class': 'no-data' }, 'No attempts match the current filters.')); return; }
    var stats = groups.map(groupStats);
    var maxVal = Math.max.apply(null, stats.map(function (s) { return Math.max(s.medianElapsedMs || 0, s.p90ElapsedMs || 0); }).concat([1]));
    stats.forEach(function (s) {
      renderScaledBarsRow(body, s.provider + ' / ' + s.requestedModel, 'coverage ' + s.elapsedCoverage, [
        { value: s.medianElapsedMs, color: 'var(--lookup-first)', label: 'median' },
        { value: s.p90ElapsedMs, color: 'var(--other)', label: 'p90' }
      ], maxVal, fmtMs);
    });
  }

  // ---- chart 3: cost ---------------------------------------------------------------------------
  function renderCost(groups) {
    var body = document.querySelector('#chart-cost .chart-body');
    body.innerHTML = '';
    if (groups.length === 0) { body.appendChild(h('p', { 'class': 'no-data' }, 'No attempts match the current filters.')); return; }
    var stats = groups.map(groupStats);
    var maxVal = Math.max.apply(null, stats.map(function (s) { return Math.max(s.costPerSuccessfulTask || 0, s.averageKnownCostPerPricedAttempt || 0); }).concat([0.000001]));
    stats.forEach(function (s) {
      var coverageLabel = 'cost coverage ' + (fmtPct(s.costCoverageRate) || 'n/a') + (s.costPartial ? ' (partial)' : '');
      renderScaledBarsRow(body, s.provider + ' / ' + s.requestedModel, coverageLabel, [
        { value: s.costPerSuccessfulTask, color: 'var(--success)', label: 'cost/success' },
        { value: s.averageKnownCostPerPricedAttempt, color: 'var(--lookup-first)', label: 'avg/priced' }
      ], maxVal, fmtCost);
    });
  }

  // ---- chart 4: initial strategy distribution ---------------------------------------------------
  // Describes how each run STARTED (was the first tool call list_nodes?) — see completionMode
  // below for how a successful run ENDED, a deliberately separate, orthogonal question.
  function renderStrategy(groups) {
    var body = document.querySelector('#chart-strategy .chart-body');
    body.innerHTML = '';
    if (groups.length === 0) { body.appendChild(h('p', { 'class': 'no-data' }, 'No attempts match the current filters.')); return; }
    groups.forEach(function (g) {
      var s = groupStats(g);
      var segments = STRATEGY_ORDER.map(function (strategy) {
        return { value: s.strategyCounts[strategy], color: STRATEGY_COLORS[strategy], label: strategy };
      });
      renderStackedRow(body, g.provider + ' / ' + g.requestedModel, 'n=' + s.attempts + ' (all outcomes)', segments, s.attempts);
    });
  }

  // ---- chart 4b: completion-mode comparison -------------------------------------------------------
  // Orthogonal to strategy: describes how a SUCCESSFUL run's terminal turn completed (tool call vs.
  // text), never how it started. Never derived from — or used to derive — outcome/strategy.
  var COMPLETION_MODE_COLORS = { 'tool-action': 'var(--direct)', 'text-response': 'var(--text-only)', incomplete: 'var(--other)' };
  function renderCompletionMode(groups) {
    var body = document.querySelector('#chart-completion-mode .chart-body');
    body.innerHTML = '';
    if (groups.length === 0) { body.appendChild(h('p', { 'class': 'no-data' }, 'No attempts match the current filters.')); return; }
    groups.forEach(function (g) {
      var s = groupStats(g);
      var segments = [
        { value: s.toolActionSuccesses, color: COMPLETION_MODE_COLORS['tool-action'], label: 'tool-action' },
        { value: s.textResponseSuccesses, color: COMPLETION_MODE_COLORS['text-response'], label: 'text-response' },
        { value: s.incompleteAttempts, color: COMPLETION_MODE_COLORS.incomplete, label: 'incomplete' }
      ];
      var subLabel = 'n=' + s.attempts + ' · successful lookup-action round trips=' + s.successfulLookupActionRoundTrips;
      renderStackedRow(body, g.provider + ' / ' + g.requestedModel, subLabel, segments, s.attempts);
    });
  }

  // ---- chart 5: attempt-level scatter -------------------------------------------------------------
  function renderScatter(records) {
    var body = document.querySelector('#chart-scatter .chart-body');
    body.innerHTML = '';
    var details = document.getElementById('scatter-details');
    var plottable = records.filter(function (r) { return typeof r.providerTotalTokens === 'number' && typeof r.elapsedMs === 'number'; });
    var excluded = records.length - plottable.length;

    if (plottable.length === 0) {
      body.appendChild(h('p', { 'class': 'no-data' }, 'No attempts in the current filter report a providerTotalTokens value — nothing plottable (never shown as 0).'));
      if (excluded > 0) body.appendChild(h('p', { 'class': 'hint' }, excluded + ' attempt(s) excluded — no providerTotalTokens reported.'));
      return;
    }

    var W = 760, H = 380, M = 56;
    var xs = plottable.map(function (r) { return r.elapsedMs; });
    var ys = plottable.map(function (r) { return r.providerTotalTokens; });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    function sx(v) { return minX === maxX ? W / 2 : M + ((v - minX) / (maxX - minX)) * (W - 2 * M); }
    function sy(v) { return minY === maxY ? H / 2 : H - M - ((v - minY) / (maxY - minY)) * (H - 2 * M); }

    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, 'class': 'scatter', role: 'group', 'aria-label': 'Elapsed time vs provider total tokens scatter plot' });
    svg.appendChild(svgEl('rect', { x: M, y: M, width: W - 2 * M, height: H - 2 * M, fill: 'none', stroke: '#8888884d' }));
    var xLabel = svgEl('text', { x: W / 2, y: H - 12, 'text-anchor': 'middle', 'font-size': '11' });
    xLabel.textContent = 'elapsedMs (ms) — range ' + Math.round(minX) + '\\u2013' + Math.round(maxX);
    svg.appendChild(xLabel);
    var yLabel = svgEl('text', { x: 14, y: H / 2, 'text-anchor': 'middle', 'font-size': '11', transform: 'rotate(-90 14 ' + (H / 2) + ')' });
    yLabel.textContent = 'provider-reported total tokens — range ' + minY + '\\u2013' + maxY;
    svg.appendChild(yLabel);

    plottable.forEach(function (r, i) {
      var cx = sx(r.elapsedMs), cy = sy(r.providerTotalTokens);
      var color = OUTCOME_COLORS[r.outcome] || 'var(--other)';
      var circle = svgEl('circle', { cx: cx.toFixed(1), cy: cy.toFixed(1), r: '5', fill: color, tabindex: '0', role: 'img' });
      var summary = r.provider + ' / ' + r.requestedModel + (r.actualModel ? ' (actual: ' + r.actualModel + ')' : '') +
        ' · scenario=' + r.scenarioId + ' · outcome=' + r.outcome + ' · strategy=' + r.strategy +
        ' · completionMode=' + r.completionMode +
        ' · turns=' + r.turnCount + ' · elapsed=' + Math.round(r.elapsedMs) + 'ms' +
        ' · providerTotalTokens=' + r.providerTotalTokens +
        ' · normalizedTokens=' + (typeof r.totalTokens === 'number' ? r.totalTokens : 'n/a') +
        ' · effectiveCost=' + (typeof r.effectiveCost === 'number' ? (DATA.costCurrency + ' ' + r.effectiveCost.toFixed(6)) : 'n/a');
      circle.setAttribute('aria-label', summary);
      var titleEl = svgEl('title', {});
      titleEl.textContent = summary;
      circle.appendChild(titleEl);
      function show() { details.textContent = summary; }
      circle.addEventListener('mouseenter', show);
      circle.addEventListener('focus', show);
      circle.addEventListener('click', show);
      svg.appendChild(circle);
    });

    body.appendChild(svg);
    if (excluded > 0) {
      body.appendChild(h('p', { 'class': 'hint' }, excluded + ' attempt(s) excluded from the plot — no providerTotalTokens reported (never plotted as 0).'));
    }
  }

  // ---- render loop -----------------------------------------------------------------------------
  function renderAll() {
    var records = filteredRecords();
    var groups = groupByModel(records);
    renderSuccessRate(groups);
    renderLatency(groups);
    renderCost(groups);
    renderStrategy(groups);
    renderCompletionMode(groups);
    renderScatter(records);
  }

  renderAll();
})();
`;

/**
 * Builds the complete, self-contained `latest.html` dashboard for one multi-turn report. Pure
 * (no filesystem access — the live spec owns writing the file, same convention as every other
 * formatter in this module's sibling `multiTurnVerificationMetrics.ts`).
 */
export const buildMultiTurnDashboardHtml = (report: MultiTurnVerificationReport): string => {
    const dataJson = jsonForInlineScript(report);
    const title = `Multi-turn locator benchmark — ${report.generatedAt}`;

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body>
<header>
  <h1>Multi-turn locator benchmark dashboard</h1>
  <p class="meta">Generated <span id="generated-at"></span> &middot; Currency: <span id="cost-currency"></span> &middot; ${report.records.length} attempt(s) recorded (before filtering)</p>
</header>

<section id="filters" aria-label="Filters">
  <fieldset id="model-filters"><legend>Models</legend></fieldset>
  <fieldset id="scenario-filters"><legend>Scenarios</legend></fieldset>
</section>

<section id="legend" aria-label="Outcome legend"></section>

<main>
  <section id="chart-success-rate" class="chart-section" aria-label="Final task success rate by model">
    <h2>1. Final task success rate by model</h2>
    <p class="hint">Denominator: all attempts (not just successes). Stacked segments distinguish direct / lookup-first / text-only / other successes; the unfilled remainder is every non-success outcome.</p>
    <div class="chart-body"></div>
  </section>

  <section id="chart-latency" class="chart-section" aria-label="Latency comparison">
    <h2>2. Latency comparison</h2>
    <p class="hint">Median and P90 elapsed time per attempt, in milliseconds (ms). "coverage" shows how many attempts reported an elapsed time out of the group's total.</p>
    <div class="chart-body"></div>
  </section>

  <section id="chart-cost" class="chart-section" aria-label="Cost comparison">
    <h2>3. Cost comparison</h2>
    <p class="hint">Cost per successful task and average known cost per priced attempt. Cost coverage is shown per model; a model with zero priced attempts shows "no data", never a $0 bar.</p>
    <div class="chart-body"></div>
  </section>

  <section id="chart-strategy" class="chart-section" aria-label="Initial strategy distribution">
    <h2>4. Initial strategy distribution</h2>
    <p class="hint">How each run STARTED — direct / lookup-first / text-only / other, across ALL attempts regardless of outcome. Never confuse this with how a successful run ENDED — see "Completion-mode comparison" below for that, an orthogonal question.</p>
    <div class="chart-body"></div>
  </section>

  <section id="chart-completion-mode" class="chart-section" aria-label="Completion-mode comparison">
    <h2>4b. Completion-mode comparison</h2>
    <p class="hint">How a SUCCESSFUL run's terminal turn completed — via a tool call ("tool-action") or via text ("text-response") — plus every incomplete (non-success) attempt. Orthogonal to strategy above: a lookup-first run can complete either way. "Successful lookup-action round trips" counts only a lookup-first, tool-action success whose tool sequence has a real acting tool call AFTER the initial list_nodes — never a bare list_nodes-only or a lookup-then-text success.</p>
    <div class="chart-body"></div>
  </section>

  <section id="chart-scatter" class="chart-section" aria-label="Attempt-level scatter plot">
    <h2>5. Attempt-level scatter: elapsed time vs. provider-reported tokens</h2>
    <p class="hint">Y-axis is the provider-reported total token figure (may include cached/reasoning tokens some providers fold in) — never the normalized input+output token count, and never fabricated for an attempt that didn't report one; those are excluded and counted below the chart instead.</p>
    <div class="chart-body"></div>
    <div id="scatter-details" class="details-panel" aria-live="polite">Hover, click, or focus (Tab) a point to see its full details here.</div>
  </section>
</main>

<script id="report-data" type="application/json">${dataJson}</script>
<script>${CLIENT_JS}</script>
</body>
</html>
`;
};
