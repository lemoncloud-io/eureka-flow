# Flow-agent eval — comparing two designs by correctness

> **SETTLED (2026-08-05) — historical record.** This benchmark produced the shipped decision: the **hybrid**
> (builder builds the structure; block specialists author the content) —
> [context-strategy-and-composition.md](./context-strategy-and-composition.md),
> [architecture.md · the hybrid writer layer](./architecture.md#the-hybrid-writer-layer). The two-design A/B
> below is kept as the record of _how_ that was decided, not a live gate; with edge + locator retired the
> fan-out arm is now degenerate.
>
> A **design-agnostic** benchmark: one fixed ladder of scenarios (simple → complex), each verified by code,
> run identically against **two agent designs** so we can compare their **correctness** on the same footing.
> This page is the spec for that benchmark — the scenario catalog, the oracle discipline, the comparison
> protocol, and (once two designs are co-correct) the cost & time metering that ranks them.
>
> **Grounding.** Built on what ships in `@flows/agent` today: `runScenario` / `TurnResult`
> (`libs/agent/src/__tests__/harness/runScenario.ts`), the `CanvasBinding` graph model
> (`Graph = WorkflowState = { nodes: NodeData[]; edges: EdgeData[] }`), the `LlmGateway` seam
> (`libs/agent/src/llm/llmGateway.ts`), and the fixture graph + catalog
> (`libs/agent/src/__tests__/harness/fixtures.ts`). Behavior & the loop: **[harness-spec.md](./harness-spec.md)**;
> how we verify a single design: **[harness-scenarios.md](./harness-scenarios.md)**; types:
> **[harness-interfaces.md](./harness-interfaces.md)**. Last updated 2026-08-03.

---

## 0 · The one idea that makes the comparison fair

**A scenario is a pure triple `(objective, initialGraph, oracle)` and knows nothing about the design under
test.** The oracle reads only the three public observables of a turn — `outcome`, the post-turn `graph`, and
`committed` — never any agent internals. So the _same_ scenario runs unchanged against either design; the only
per-design code is a thin **adapter** that turns an objective + a graph into those three observables.

```
scenario  ─────────────►  RunAdapter (design A | design B)  ─────────────►  { outcome, graph, committed }
(objective, graph)                                                           └── oracle reads these ──► pass / fail
```

Concretely, the two adapters are the two strategies — the same scenario and the same oracle, one roster apart:

```mermaid
flowchart LR
    SC["Scenario<br/>(objective, initialGraph, oracle)"]
    SC --> A1["Adapter · Strategy 1<br/>orchestrator + fan-out roster"]
    SC --> A2["Adapter · Strategy 2<br/>orchestrator + builder roster"]
    A1 --> OB1["outcome · graph · committed"]
    A2 --> OB2["outcome · graph · committed"]
    OB1 --> OR["shared oracle"]
    OB2 --> OR
    OR --> V["pass / fail"]
```

This is the whole discipline: **correctness lives in the oracle (shared), and only the adapter differs.** If a
verdict could only be produced by peeking inside one design, it is not a fair verdict and does not belong here.

> **The two designs.** The concrete A/B here is the pair of strategies the harness can run
> ([architecture.md · the hybrid writer layer](./architecture.md#the-hybrid-writer-layer)): **Design
> A = Strategy 1** (the orchestrator fans out to narrow block + operation specialists; no skills) and **Design
> B = Strategy 2** (the orchestrator hands the whole plan to one `builder` that carries tools + `use_skill`
> and spawns nothing). Both run through the **same** `runScenario` orchestrator harness — they differ only in
> the **roster** exposed — so the comparison is unusually clean. The spec still does not care _what_ the two
> designs are, so a genuinely different Design B (e.g. a single code-writing agent in the n8n "BUILD" shape)
> drops in the same way — it is just another `RunAdapter`.

> **Isolating the builder — the roster picks the routing rule.** For the A/B to measure Strategy 2 and not a
> hybrid, the builder roster is **builder-exclusive**, and the orchestrator is shown a **builder-routing rule**:
> _all_ node & wiring work — add, configure, rename, delete, connect, rewire, insert, build — goes to the one
> `builder`, and there are no per-block agents. The **generic-block rule** ("any other catalog block type is
> served by a generic block agent automatically") is shown **only** to rosters that carry block specialists —
> fan-out and the shipped default — so Strategy 1 and production routing stay byte-for-byte the same.
> `renderContext` derives which rule to render from the roster it already holds (builder-exclusive ⇒ the builder
> rule, otherwise the block rule). The sub-agent runner's catalog fallback is **unchanged**, but under the
> builder roster nothing invites it — no prompt advertises a generic block agent and only the builder card is
> visible; a **transcript guard** on the live run (no agent label other than `…:builder` may appear) surfaces it
> if it ever fires.

> **Each strategy briefs with its own mental model — two orchestrator prompts, one gate.** The routing rule was
> the first cut; the orchestrator's _base_ system prompt is now chosen the same way (`orchestratorPromptFor`).
> **Fan-out** (and the shipped default) keeps the _decompose_ prompt — break the request into the smallest
> per-specialist tasks and coordinate them, independent together and dependent in sequence. **Builder** gets a
> _plan-and-hand-off_ prompt — do NOT decompose; work the request into ONE complete plan and delegate it to the
> Builder in a single briefing. So Strategy 2 is briefed to play to the Builder's strength — one pass, no
> re-discovery — rather than made to fragment a job it can do whole. Same builder-exclusive gate as the routing
> rule, so fan-out and production are byte-for-byte unchanged.

---

## 1 · The adapter contract

```ts
// The ONLY per-design code. Both designs implement this. It must be a black box: given an objective over a
// graph, produce the three observables the oracle reads.
interface RunAdapter {
    readonly designId: string; // 'strategy-1-fanout' | 'strategy-2-builder' (or any A/B) — labels the scorecard
    run(input: BenchmarkInput): Promise<BenchmarkResult>;
}

interface BenchmarkInput {
    objective: string;
    initialGraph: Graph; // cloned per run by the adapter — a scenario is reused across N runs & 2 designs
    userPermissions?: AgentGrant; // default { canModifyCanvas, canEditConfig }; {} = viewer (permission cases)
    catalog?: CatalogLookup; // default = createFixtureCatalog()
}

interface BenchmarkResult {
    outcome: TurnOutcome; // applied | partial | answered | refused  (shared parse: parseOutcome)
    graph: Graph; // post-turn live graph — the direct-edit oracle target
    committed: boolean; // did the live graph change this turn  ── correctness fields above ──
    cost: TurnCost; // NEW — per-turn token / round-trip / USD accounting (defined + metered in §4)
    elapsedMs: number; // NEW — end-to-end run() wall-clock (§4)
}
```

**Both strategies' adapters are one-liners over the shipped harness** — `runScenario` already returns
`{ outcome, graph, committed }`; each adapter only registers the strategy's **roster** and forwards the rest:

```ts
const strategy1Adapter: RunAdapter = {
    designId: 'strategy-1-fanout',
    async run({ objective, initialGraph, userPermissions, catalog }) {
        const { outcome, graph, committed } = await runScenario({
            objective,
            initialGraph,
            userPermissions,
            catalog,
            roster: fanoutRoster, // Strategy 1: block + operation agents (no builder)
            makeGateway: () => liveGateway, // the seam runScenario already exposes
        });
        return { outcome, graph, committed };
    },
};
// Strategy 2's adapter is identical but registers ONLY the builder: `roster: builderRoster`. Selecting the
// roster is the one extra seam runScenario needs for the benchmark (test-only) — `createOrchestratorAgent`
// already accepts a `roster`, so it is a passthrough.
```

The benchmark adds two things to this passthrough. **(a) Metering:** `makeGateway` composes a metering gateway
over the live one so every round-trip's usage is summed and `run()` is timed, populating `cost` + `elapsedMs`
(§4). **(b) Isolation:** under the builder-exclusive roster the orchestrator is shown the builder-routing rule —
all node & wiring work goes to the one builder, never the generic-block rule (§0) — so Strategy 2 is a _pure_
builder design, not builder-plus-block-agents.

A design that is **not** the orchestrator harness at all (e.g. a single code-writing agent in the n8n
"BUILD" shape) implements the same interface over its own entry point. If it does not expose an
`{ outcome, graph, committed }` surface, the adapter derives them the same way `runScenario` does — read the
final graph from its binding, diff it against a clone of `initialGraph` for `committed`, and re-ask the model
once for the `TurnOutcome` JSON (`parseOutcome`). **Every design must derive `outcome` the identical way** so
the correctness comparison is not contaminated by two different outcome-extraction methods.

---

## 2 · Correctness — the oracle discipline (reused verbatim)

The rule is the one already locked in [harness-scenarios.md](./harness-scenarios.md): **well-formedness ≠
correctness**, and each oracle is _only as strict as the intent fixes it_.

- **exact** where the intent pins a value — `"set the model to Gemini 2.5 Pro"` ⇒ `config.model === 'gemini-2.5-pro'`.
- **relational** where it does not — `"nudge right a bit"` ⇒ `x↑ ∧ y=`, never a magnitude.
- **structural** for build/rewire — assert _paths and node/edge presence_, never a specific id or position the
  request never named (`"insert a buffer between gen and preview"` ⇒ the path `gen → ? → prev` exists, its one
  hop is a `buffer`, and no direct `gen → prev` edge remains — not "the new node's id is `n_5`").
- **no-edit** for every `refused` / `answered` — `committed === false` **and** the post-turn graph deep-equals
  the scenario's own initial graph (`expectUnchanged`).

An oracle is a pure function `(BenchmarkResult, initialGraph) → { pass: boolean; note?: string }`. It is the
_same function object_ fed both designs' results — there is exactly one oracle per scenario, shared.

```ts
interface Scenario {
    id: string; // 'T4.build-pipeline'
    tier: 0 | 1 | 2 | 3 | 4 | 5;
    objective: string; // the verbatim prompt handed to the agent
    initial: () => Graph; // a fresh graph per run (fixture, a minimal graph, or empty)
    userPermissions?: AgentGrant;
    expect: TurnOutcome['status']; // the intended outcome — the coarse first check
    oracle: (r: BenchmarkResult, initial: Graph) => { pass: boolean; note?: string };
    // OPEN-ENDED scenarios (T4/T5) also carry a requirement rubric for partial credit (§2.1); `oracle`
    // is then `requirements.every(pass)`. Simple scenarios omit it.
    requirements?: Requirement[];
}
interface Requirement {
    id: string; // 'input-reaches-generator'
    check: (g: Graph, initial: Graph) => boolean;
}
```

Helpers the oracles use (all pure over `Graph`, reusing the shipped `nodeById` / `IDS` from `fixtures.ts`):

```ts
const edgeExists = (g: Graph, s: string, t: string) => g.edges.some(e => e.sourceNodeId === s && e.targetNodeId === t);
const hasNodeOfType = (g: Graph, type: string) => g.nodes.some(n => n.type === type);
const outDegree = (g: Graph, id: string) => g.edges.filter(e => e.sourceNodeId === id).length;
// a directed path a ⇒ … ⇒ b exists (BFS over edges) — the backbone of every build/rewire oracle
const reaches = (g: Graph, a: string, b: string) => {
    /* BFS from a over sourceNodeId→targetNodeId, true if b is hit */
};
const unchanged = (r: BenchmarkResult, initial: Graph) => r.committed === false && deepEqual(r.graph, initial);
```

---

## 2.1 · Verifying open-ended scenarios (build & refactor)

A build or refactor has **many correct answers**: two designs may return structurally different graphs that
are both right. So the oracle must **not** compare against a golden graph. The reframe:

> **Verify the _spec_ (what the graph must do), never the _plan_ (how the agent built it).** Correctness is a
> conjunction of invariants; the set of accepted graphs is defined _implicitly_ by those invariants — possibly
> infinite. Every correct realization satisfies them; no wrong one does. You never enumerate the good graphs.

Choose invariants that are **necessary** (every correct graph has them) and **sufficient** (no wrong graph
does), from this ladder — weakest to strongest — and `AND` the clauses the intent justifies:

1. **Existence / count** — "a generator exists." One clause only; brittle alone.
2. **Typed-path (motif) embedding** — the workhorse. Not `edgeExists(gen, prev)` but _"a directed dataflow path
   runs through a node of type input-text, then a generator, then a preview."_ Accepts any topology that
   realizes the dataflow (extra hops, any ids, any build order); rejects a missing/reversed/disconnected one.
3. **Global validity** — reuse the engine's **own** rules as an oracle: every edge's ports type-check
   (`arePortTypesCompatible`), acyclic (`wouldCreateCycle`), ≤1 driver per input port, no dangling required
   input. A correct build is always valid; this catches "wired but nonsensical."
4. **Pinned invariants** — exact **only** where the intent named a value (`generator.config.model`). Never pin
   an id or position the request never specified.
5. **Behavioral / execution oracle** — the strongest and most design-agnostic: **run the flow on a fixed input
   and assert the output.** It ignores shape entirely and judges _what the graph computes_. Make such a
   scenario out of **deterministic blocks** (`input-text`, `buffer`, `echo`, `image-resize`, `preview`) so the
   output is exact and needs no API key; for a `generator`, leave its _output_ unasserted but assert its
   presence + config + wiring via 2–4 (or swap in an identity stand-in block to keep behavior deterministic).
6. **Relational oracle (refactor)** — a refactor is a _behavior-preserving structural change_, so the oracle
   compares pre vs post: **the intended structural delta happened AND the dataflow that must survive still
   survives.** "Insert a buffer between gen and preview" ⇒ `gen` still `reaches` `prev` (preserved), a
   `buffer` now sits on that path (the delta), the direct `gen→prev` edge is gone, the graph is still valid —
   no golden graph, no execution.

```ts
// (2) typed path: ∃ a→…→b→…→c with those node types, in order — one chain threaded through by reachability
const embedsTypedPath = (g: Graph, types: string[]): boolean => {
    const idsOf = (t: string) => g.nodes.filter(n => n.type === t).map(n => n.id);
    let frontier = idsOf(types[0]);
    for (const t of types.slice(1)) {
        frontier = idsOf(t).filter(dst => frontier.some(src => reaches(g, src, dst)));
        if (!frontier.length) return false;
    }
    return true;
};
// (3) validity — the engine's OWN semantics reused as the oracle (canvas/edgeSemantics.ts + a driver check)
const isValid = (g: Graph, cat: CatalogLookup): boolean =>
    g.edges.every(e => portsCompatible(e, g, cat)) && !hasCycle(g) && atMostOneDriverPerInput(g);
// (6) refactor — preserved dataflow + intended delta, no golden graph
const insertBufferOracle = (r: BenchmarkResult) =>
    reaches(r.graph, IDS.gen, IDS.prev) && // behavior preserved
    !edgeExists(r.graph, IDS.gen, IDS.prev) && // no longer direct
    onPath(r.graph, IDS.gen, IDS.prev, n => n.type === 'buffer') && // a buffer between
    isValid(r.graph, catalog);
```

### The linchpin — test the oracle itself

An open-ended oracle is code, so it has bugs, and a buggy oracle silently scores a wrong design as correct.
Calibrate every T4/T5 oracle with a **no-false-accept / no-false-reject** meta-test: hand-author graphs and
assert the oracle's verdict, so the oracle is trusted before it judges a live model.

```ts
describe('oracle: T4.build-pipeline', () => {
    // MUST accept — same spec, different shapes
    it.each([minimal3Node, withExtraBuffer, differentIdsAndPositions, redundantButHarmlessPreview])(
        'accepts correct variant %#',
        v => expect(oracle(asResult(v)).pass).toBe(true)
    );
    // MUST reject — plausible wrongs
    it.each([noGenerator, edgeReversed, previewDisconnected, containsCycle, generatorOffThePath])(
        'rejects wrong variant %#',
        v => expect(oracle(asResult(v)).pass).toBe(false)
    );
});
```

### Grade, don't just pass/fail — for comparing designs

Binary loses the interesting signal. Decompose the objective into a **requirement rubric** and score `k/total`;
`oracle.pass` is then `every requirement holds`, while the rubric gives partial credit so "Design B got 3/4
(forgot to wire the preview)" is visible instead of a flat fail. The rubric doubles as the meta-test's target.

```ts
const requirements: Requirement[] = [
    { id: 'has-generator', check: g => hasNodeOfType(g, 'single-output-generator') },
    { id: 'input→generator', check: g => embedsTypedPath(g, ['input-text', 'single-output-generator']) },
    { id: 'generator→preview', check: g => embedsTypedPath(g, ['single-output-generator', 'output-preview']) },
    { id: 'valid', check: g => isValid(g, catalog) },
];
const grade = (g: Graph) => requirements.filter(r => r.check(g)).length / requirements.length; // 0..1
```

The scorecard (§6) reports the **requirement pass-rate per clause** for T4/T5, so a design's failure is
localized to _which_ invariant it broke — far more actionable than a single number.

---

## 3 · The comparison protocol (fighting non-determinism)

A live model is stochastic — one run is an anecdote. The protocol turns anecdotes into a verdict.

> **The comparison is only meaningful live.** Under the fake gateway both designs replay identical scripted
> tool calls, so they produce identical graphs and the comparison is vacuous. The whole point — how well each
> design's routing and prompting actually produce correct graphs — only shows up when a **real model** decides
> the tool calls. So the benchmark runs against a live Gemini gateway; the fake gateway is for the
> deterministic single-design specs, not for this A/B.

1. **Same everything but the adapter.** Same model + `temperature: 0`, same `initialGraph` (deep-cloned per
   run), same catalog, same `userPermissions`, same timeout. Only `RunAdapter` differs. (`temperature: 0` is
   already the live-spec default; it does not remove non-determinism but shrinks it.)
2. **N runs per (scenario × design).** Default `N = 5`; a first look can use `N = 1` (anecdotal).
3. **Correctness = pass-rate**, the fraction of the N runs whose oracle passes. This is the only axis —
   report it as `k/N`, not a boolean.
4. **Verdict per scenario:** the design with the higher pass-rate wins the scenario; a tie is a tie. For the
   graded T4/T5 scenarios, break a tie by the mean requirement pass-rate (`k/total` averaged over the runs) so
   "3/4 vs 2/4" is visible even when both flat-fail the conjunction.
5. **Aggregate** across the ladder with tier weighting if desired (complex tiers are where designs diverge),
   but always report the per-tier and per-scenario breakdown — an aggregate that hides "Design B passes every
   T0 but fails every T4 build" is a lie.
6. **Efficiency — compared only among the runs that _pass_.** Correctness gates; the cost of a wrong answer is
   meaningless, so efficiency is aggregated **over passing runs only**, and cross-design only for scenarios
   **both** designs pass. Per such cell, report mean `totalTokenCount` and mean round-trips — the trusted, cache-
   and network-independent axes (§4) — plus wall-clock and list/effective cost as reported-but-not-ranked. The
   **verdict is two-part:** the correctness winner (pass-rate, item 4) **then**, among the co-correct, the
   efficiency winner ranked on tokens/round-trips. Cost never folds into the correctness ranking.

```ts
interface ScorecardCell {
    scenarioId: string;
    designId: string;
    passRate: string; // 'k/N'
    requirementRate?: string; // 'k/total' mean over runs — T4/T5 only, the partial-credit tie-breaker
    notes: string[]; // per-run oracle notes for the misses (why a run failed)
    // efficiency — means over the PASSING runs only (undefined when k=0); see §4
    tokens?: number; // mean totalTokenCount — the ranked axis
    roundTrips?: number; // mean chat() calls — the ranked axis
    elapsedMs?: number; // mean wall-clock — reported, not ranked
    usdList?: number; // mean cache-blind cost — reported, not ranked
    usdEffective?: number; // mean cache-aware cost — reported, not ranked
}
// The benchmark runner: for each scenario, for each design, run N times, apply the shared oracle, aggregate.
declare function runBenchmark(scenarios: Scenario[], designs: RunAdapter[], n: number): Promise<ScorecardCell[]>;
```

**Repeatability & cost of the benchmark itself.** The whole ladder × 2 designs × N is a few hundred live
Gemini calls — gate it behind `RUN_LIVE` exactly like `integration.live.spec.ts`, and let a single scenario be
selectable (`-t T4.build`) so a design change can be spot-checked without the full matrix. Persist each
`ScorecardCell` to a JSON file so runs are comparable over time (the "regression scorecard" of
[harness-spec.md §10](./harness-spec.md)).

---

## 4 · Cost & time — the efficiency axis

Correctness gates; once two designs are **co-correct** on a scenario the open question is _which produces the
same right graph more cheaply and faster_. The benchmark meters four numbers per turn — but they are **not**
equal in trustworthiness, and only two of them decide the efficiency verdict.

### 4.1 · What to measure — and what each axis is worth

| axis              | what                                                                                                 | trust         | why                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **total tokens**  | Σ per-call `totalTokenCount` over every agent of the turn (re-sent prompt + thinking included, §4.3) | **primary**   | network-independent, deterministic-ish at temp 0, cache-independent, and the actual cost driver                                           |
| **round-trips**   | count of `chat()` calls in the turn                                                                  | primary       | a clean latency proxy that does not move with the network                                                                                 |
| **cost (USD)**    | _list_ (tokens × rate) and _effective_ (cache-aware, §4.3)                                           | derived       | human-readable; the _effective_ figure is real spend but **non-deterministic** (implicit-cache hits vary run-to-run and leak across runs) |
| **wall-clock ms** | end-to-end `run()` latency                                                                           | **secondary** | user-facing but **noisy** — network variance, and fan-out parallelizes children while the builder is one long serial agent                |

**Raw tokens and round-trips decide the efficiency verdict; wall-clock and cost are reported but not trusted to
rank.** Cost is twice-derived — a price constant we own times a cache state we do not control — so the stable,
cache-independent `totalTokenCount` is the axis the comparison rests on, and the cost columns are a readout of
real (effective) and list-price spend.

```ts
// Rates WE own — confirm against current Google AI pricing. Raw tokens are the ground-truth axis; these only
// scale the derived cost columns. cachedPerM applies to cachedContentTokenCount (implicit-cache hits, §4.3).
// Keyed by model so a bigger model reprices without touching the Meter.
const PRICES: Record<string, { inPerM: number; outPerM: number; cachedPerM: number }> = {
    'gemini-2.5-flash': { inPerM: 0.3, outPerM: 2.5, cachedPerM: 0.03 }, // cached = 10% of input (90% off)
};
```

### 4.2 · Where to measure — a metering gateway over the seam runScenario already exposes

Every LLM round-trip of every agent (orchestrator + each spawned specialist/builder) already flows through the
gateway the benchmark wraps around `makeGateway`. That is the exact choke point for metering — no new seam. The
Meter is test-only; the only product touch is surfacing a few more usage fields on `Chunk.usage` (§4.3).

```mermaid
flowchart LR
    subgraph turn["one turn · one run()"]
      O["orchestrator gateway"] --> M
      C1["child gateway"] --> M
      C2["child gateway"] --> M
      M["metering wrapper<br/>records transcript · sums usage · counts calls"] --> G["real Gemini gateway"]
    end
    M -.->|"usage on the done chunk"| MT["Meter · per-turn"]
    turn -.->|"performance.now around run"| WC["elapsedMs"]
```

- **Meter** — a per-turn accumulator (`addUsage(u)`, `tick()`, `totals(): TokenTotals`): pure counting, no
  pricing. Each metering gateway reads `chunk.usage` on the one usage-bearing `done` chunk per call (§4.3) and
  adds it once; `tick()` counts the call. A fresh Meter per `run()` (per scenario × design × run _i_) is threaded
  into `makeGateway`, so **all** agents of the turn write into the same Meter and the totals are the whole-turn
  sum.
- **Wall-clock** — `performance.now()` immediately around the `run()` call, so `elapsedMs` includes every
  round-trip and the outcome re-ask, i.e. the latency a user feels.
- **Result surface** — `BenchmarkResult` (§1) grows `cost: TurnCost` + `elapsedMs`; the correctness fields are
  untouched.

```ts
interface TokenTotals {
    // what Meter.totals() returns — pure counting, provider-neutral
    inputTokens: number; // Σ promptTokenCount — re-sent history included (that IS the bill, §4.3)
    cachedTokens: number; // Σ cachedContentTokenCount — input served from the implicit cache
    outputTokens: number; // Σ (totalTokenCount − promptTokenCount) — visible output + thinking
    totalTokens: number; // Σ totalTokenCount — the stable, cache-independent ground-truth axis
    roundTrips: number; // count of chat() calls in the turn
}
// the single pricing seam — a pure fn over TokenTotals + PRICES (§4.1); nothing else applies a rate
declare function price(t: TokenTotals, model: string): { usdList: number; usdEffective: number };
interface TurnCost extends TokenTotals {
    usdList: number; // cache-blind: all input at standard rate — stable, apples-to-apples
    usdEffective: number; // cache-aware: cached input at cachedPerM — real spend, but noisy + order-dependent
}
```

A provider that reports no usage yields `undefined` → counted as 0 and flagged once in the scorecard, so a
silent 0 never masquerades as "free."

**Structure & reuse.** Metering is an `LlmGateway` **decorator**, exactly like the shipped recorder;
`makeGateway` **composes** them (`recordingGateway(meteringGateway(gateway, meter), label)`) so the transcript
logic is not duplicated and, both being pure pass-through observers, composition order is free. Three
separations keep it DRY and provider-neutral: the **Meter** only accumulates `Chunk.usage` and counts calls (no
provider field names, no rates); every Gemini-specific mapping (`promptTokenCount` / `totalTokenCount` /
`cachedContentTokenCount` → `Chunk.usage`) stays in `GeminiLlmGateway`; and **counting vs. pricing** are split —
`Meter.totals()` returns raw `TokenTotals`, and a single pure `price(totals, model)` derives the USD columns from
the one `PRICES` table.

### 4.3 · Token accounting under a re-sending loop

The think/act loop re-sends the whole conversation every iteration, so call N's `promptTokenCount` already
includes the re-sent prefix. That is the bill, not an artefact to correct for — the provider charges the full
prompt on every call. **So a turn's cost is exactly Σ over every call `(input + output)`, across the orchestrator
and every child — re-sends counted each time, because they are paid each time. Summing is correct; it is not
double-counting.**

A concrete turn makes it click — a generator agent handling _"set the generator's temperature to 0.2 on gen_1"_
over three rounds (tokens illustrative; the real ones come from `usageMetadata`):

```
══ round 1 ══                                                        billed as →
◀ system   generator-specialist persona ............ ~350 ┐
◀ tools    6 fn-declarations: describe_node,          ~520 ├ base prefix
           set_properties, catalog_search, …               │  ~1050 → INPUT (call 1)
◀ context  nodes: gen_1 (single-output-generator) .. ~160 │
◀ user     "set gen_1 temperature to 0.2" ............ ~20 ┘
▶ (thinking) ........................................ ~120 → OUTPUT
▶ calls    describe_node({ id:"gen_1" }) .............. ~15 → OUTPUT
     ⟨tool runs locally — 0 tokens⟩
◀ result   { model:"gemini-2.5-flash", temperature:"0.7" }  ~60 → INPUT (re-sent from call 2)

══ round 2 ══  (re-sends base + round-1 call + result)
◀ …base 1050 + call 15 + result 60 ................ = 1125 → INPUT (call 2)
▶ (thinking) ......................................... ~80 → OUTPUT
▶ calls    set_properties({ id:"gen_1",               ~25 → OUTPUT
             props:{ temperature:"0.2" } })
     ⟨tool edits the config — 0 tokens⟩
◀ result   { ok:true } ................................ ~8 → INPUT (re-sent from call 3)

══ round 3 ══  (re-sends everything so far)
◀ …prev 1125 + call 25 + result 8 ................. = 1158 → INPUT (call 3)
▶ (thinking) ......................................... ~40 → OUTPUT
▶ says     "Set the temperature to 0.2." ............. ~15 → OUTPUT  (no tool call → done)
```

Thinking is billed as output when generated but is **not** re-sent as input — only the visible assistant parts
(tool calls / text) and tool results re-enter the prompt. Per call, this is what `usageMetadata` reports and the
Meter sums:

|  call | input `prompt` |   cached | new (prompt − cached) | output (visible + thinking) |  `total` |
| ----: | -------------: | -------: | --------------------: | --------------------------: | -------: |
|     1 |           1050 |        0 |                  1050 |              135 (15 + 120) |     1185 |
|     2 |           1125 |    ~1050 |                    75 |               105 (25 + 80) |     1230 |
|     3 |           1158 |    ~1125 |                    33 |                55 (15 + 40) |     1213 |
| **Σ** |       **3333** | **2175** |              **1158** |                     **295** | **3628** |

Priced at the `PRICES` rates (in \$0.30/M, out \$2.50/M, cached \$0.03/M):

```
list cost (cache-blind):  3333×0.30/M + 295×2.50/M                = $0.00174
effective cost (cached):  1158×0.30/M + 2175×0.03/M + 295×2.50/M  = $0.00115   (~34% less)
                          └ new input ┘└ cached −90% ┘└ output (never cached) ┘
```

Three properties of the accounting, verified against `GeminiLlmGateway`:

1. **One usage per call.** The gateway is non-streaming (one `chat()` = one `generateContent` = one bill) and
   yields `usage` exactly once, on the `done` chunk. The Meter adds it once per call — no within-call double
   count.
2. **Bill on `totalTokenCount`, not `candidatesTokenCount`.** `candidatesTokenCount` is only the _visible_
   output — 55 tokens across the three calls above — so a candidates-only meter would report 55 where the true
   output is **295**, silently dropping the 240 thinking tokens (`thinkingBudget: 1024`), the bulk and priciest
   part of the output side. So `Chunk.usage` surfaces `usageMetadata.totalTokenCount` and derives
   `output = total − prompt`, immune to whether candidates includes thoughts.
3. **Implicit caching is on — capture `cachedContentTokenCount`.** Gemini 2.5+ caches automatically (only
   _explicit_ `CachedContent` is off). A prefix shared with a recent call is billed 90% off (\$0.03/M vs
   \$0.30/M), reported as `cachedContentTokenCount` — the `cached` column, which turned this turn's bill from
   \$0.00174 to \$0.00115.
   The loop is the ideal shape (stable prefix front, new turn appended end), and the refund lands on exactly the
   re-sent prefix, favouring the builder's one long thread. Two consequences: **(a)** price cached input at
   `cachedPerM` or cost over-states input; **(b)** implicit hits are best-effort and _order-dependent_ — a
   design that runs second can hit the first's warm prefix — so the _effective_ figure is non-deterministic and
   the fair cross-design axis stays raw `totalTokenCount`. Report both a _list_ figure (cache-blind, stable) and
   an _effective_ one (real spend); their gap = how cache-friendly each design is.

The example already shows the **four ways a tool call costs**, all captured by metering `usageMetadata` per call
(never reconstructed from text): the **tool schemas** in the ~520-token base (input every call, then cached), the
**tool call** as output, the **tool result** as re-sent input (fat reads like `catalog_search` accumulate), and
each exchange forcing another **round-trip**. Local tool _execution_ is free in tokens (`⟨0 tokens⟩` above) — the
one tool cost outside the bill; it lands only in wall-clock (negligible in-memory, but the dominant time cost
once tools hit real services at n8n scale).

Nominally this re-send tax is where the designs diverge — the builder re-sends _one long history_ across up to 20
iterations, fan-out spreads _short, isolated_ child histories (a fresh store each) plus the orchestrator's — but
caching refunds most of it, so the real gap is empirical. The Meter settles it by summing per-call totals.

---

## 5 · The scenario ladder (simple → complex)

Every row is design-agnostic. The graphs: **`fixture`** = the shipped 4-node chain
`input-text → buffer → single-output-generator → output-preview` (`makeInitialGraph()`), **`minimal`** = the
smallest graph the case needs, **`empty`** = `{ nodes: [], edges: [] }`. Objectives keep an **explicit target**
except where ambiguity _is_ the test (per the discipline). Tiers T0–T2 largely formalize what
`integration.live.spec.ts` already probes; **T3–T5 are the new, harder cases where two designs actually
diverge** and are where this benchmark earns its keep.

### Tier 0 — single primitive edit (`applied`)

| id          | objective                                  | graph   | oracle (post-turn)                                                              |
| ----------- | ------------------------------------------ | ------- | ------------------------------------------------------------------------------- |
| `T0.move`   | "move the input-text node to x=200, y=100" | fixture | exact: `txt.position == {200,100}`; other 3 unchanged; `committed`              |
| `T0.rename` | "rename the preview to 'Result'"           | fixture | exact: `prev.customLabel === 'Result'`                                          |
| `T0.config` | "set the generator's temperature to 0.2"   | fixture | exact: `gen.config.temperature === '0.2'`; `gen.config.model` preserved (merge) |

### Tier 1 — single edit needing judgement (relational / merge / spatial)

| id               | objective                                                     | graph   | oracle                                                                     |
| ---------------- | ------------------------------------------------------------- | ------- | -------------------------------------------------------------------------- |
| `T1.nudge`       | "nudge the input right a bit"                                 | fixture | relational: `txt.x↑ ∧ txt.y=`; no magnitude asserted (= A1)                |
| `T1.model-merge` | "set the generator's model to Gemini 2.5 Pro"                 | fixture | exact `model==='gemini-2.5-pro'` **and** `temperature==='0.7'` kept (= A2) |
| `T1.align`       | "line the four nodes up in one column, keeping each node's y" | fixture | relational: all four `x` equal (any value); every `y` preserved (= A4)     |

### Tier 2 — compound, two dependent edits (`applied`), and single-fault refusals

| id                  | objective                                                           | graph                            | expect   | oracle                                                                                         |
| ------------------- | ------------------------------------------------------------------- | -------------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `T2.delete-rewire`  | "delete the buffer and connect the input directly to the generator" | fixture                          | applied  | `buf` gone; no edge touches `buf`; `edgeExists(txt, gen)` (= A5)                               |
| `T2.add-config`     | "add a generator and set its model to Gemini 2.5 Pro"               | fixture                          | applied  | a 2nd `single-output-generator` exists whose `config.model==='gemini-2.5-pro'`; node count +1  |
| `T2.ambiguous`      | "move the node right"                                               | `minimal` (two same-typed nodes) | refused  | `unchanged` — asks which (= Q1, sharpened with a real ambiguity)                               |
| `T2.bad-value`      | "set the generator's model to gpt-4o"                               | fixture                          | refused  | `unchanged`; reason names a real model from `GENERATOR_MODELS` (= Q2)                          |
| `T2.unknown-field`  | "set the generator's max tokens to 500"                             | fixture                          | refused  | `unchanged` — didn't invent/remap a field (= Q4)                                               |
| `T2.occupied-input` | "connect the input directly into the generator"                     | fixture                          | refused  | `unchanged` — `gen.in` already fed by the buffer; edge agent rejects, names the occupying edge |
| `T2.cycle`          | "connect the generator's output to the buffer's input"              | fixture                          | refused  | `unchanged` — would form `buf→gen→buf`; rejected as a cycle                                    |
| `T2.permission`     | "rename the preview to 'Result'" · `userPermissions: {}`            | fixture                          | refused  | `unchanged` — viewer, denied at the executor (= R2)                                            |
| `T2.capability-gap` | "run the generator node"                                            | fixture                          | refused  | `unchanged` — no specialist executes nodes (= R1)                                              |
| `T2.answered`       | "which model is the generator using?"                               | fixture                          | answered | `unchanged`; the answer contains `gemini-2.5-flash`                                            |

### Tier 3 — coordination across ≥3 edits (the multi-agent path's home turf)

| id                   | objective                                                                      | graph   | expect  | oracle                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------ | ------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| `T3.add-wire-config` | "add a second generator set to Gemini 2.5 Pro and feed the input-text into it" | fixture | applied | new gen node exists, `config.model==='gemini-2.5-pro'`, and `edgeExists(txt, <newGen>)`; original chain intact |
| `T3.fan-out`         | "connect the input-text to both the buffer and a new preview"                  | fixture | applied | a 2nd `output-preview` exists; `txt` out-degree ≥2; both targets reachable from `txt`                          |
| `T3.reroute`         | "make the preview show the buffer's output instead of the generator's"         | fixture | applied | `edgeExists(buf, prev)`; **not** `edgeExists(gen, prev)`; node count unchanged                                 |
| `T3.space-evenly`    | "spread the four nodes out evenly along the x-axis, same order"                | fixture | applied | relational: `x` strictly increasing in chain order; adjacent gaps ≈ equal (within tolerance); `y` preserved    |

### Tier 4 — build from little/nothing (the n8n "BUILD" test)

> These are the scenarios where two designs legitimately return different-but-correct graphs. Their oracles
> follow **§2.1**: typed-path embedding + validity + pinned config, graded by a requirement rubric, and each
> oracle is calibrated by its own no-false-accept/no-false-reject meta-test. Add a **deterministic behavioral
> variant** (`T4.build-passthrough`: "build text → buffer → preview") whose oracle _runs_ the flow on input
> `'hello'` and asserts the preview reads `'hello'` — the shape-blind gold-standard check, no key needed.

| id                    | objective                                                                                    | graph | expect  | oracle                                                                                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------- | ----- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `T4.build-pipeline`   | "build a flow that takes a text input, runs it through a generator, and previews the result" | empty | applied | one `input-text`, one `single-output-generator`, one `output-preview` exist; `reaches(txt → gen)` and `reaches(gen → preview)` (a directed path, direct or via added nodes); ≥3 nodes, connected |
| `T4.build-configured` | "build a text → Gemini 2.5 Pro generator → preview pipeline"                                 | empty | applied | as `T4.build-pipeline` **plus** the generator's `config.model==='gemini-2.5-pro'`                                                                                                                |
| `T4.build-branch`     | "from a single text input, run it through two generators and preview each"                   | empty | applied | one input, two generators, two previews; `reaches(input → each preview)`; input out-degree ≥1 feeding both branches                                                                              |

### Tier 5 — refactor an existing flow (splice / extract / partial)

| id                   | objective                                                               | graph                                                        | expect       | oracle                                                                                                                                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `T5.insert-between`  | "insert a buffer between the generator and the preview"                 | fixture (start from the _no-buffer_ variant: `txt→gen→prev`) | applied      | a `buffer` node exists on the path; `reaches(gen → buffer)` ∧ `reaches(buffer → prev)`; **no** direct `edgeExists(gen, prev)`; net node count +1                                                                                         |
| `T5.extract-preview` | "delete the preview and everything that only fed it"                    | fixture                                                      | applied      | `prev` gone; any node whose _only_ consumer was `prev` also gone; the rest of the chain intact                                                                                                                                           |
| `T5.mixed-validity`  | "set the generator's model to Gemini 2.5 Pro and its max tokens to 500" | fixture                                                      | **unpinned** | _no oracle asserts a status_ — `partial` (model set, bad field reported) **or** `refused` (whole ask rejected) both pass; the oracle only checks: if `committed`, then `model==='gemini-2.5-pro'` and no invented `maxTokens` key exists |

> **`T5.mixed-validity` is deliberately not scored on outcome status** — per the discipline, a mixed-validity
> ask is exactly the case where `partial` vs `refused` is the agent's judgement, so the benchmark leaves it
> unpinned and only forbids a _wrong_ edit. It is included because how each design _handles_ a partial-fault
> request (does it salvage the good part? does it hallucinate the bad field?) is one of the most revealing
> differences between designs — but it is measured by the no-bad-edit invariant, never by a status the spec
> refuses to pin.

**Coverage the ladder guarantees:** `applied` (T0–T1 primitives, T2 compounds, T3 coordination, T4 builds,
T5 refactors) · `refused` (ambiguity, bad value, unknown field, occupied input, cycle, permission,
capability-gap) · `answered` (pure question) · and the unpinned mixed-fault case. Every `refused`/`answered`
row uses the `unchanged` no-edit oracle.

---

## 6 · Reporting — the scorecard

Print one table per tier and one aggregate, both designs side by side, mirroring the `afterAll` scorecard in
`integration.live.spec.ts`. Each cell now also carries the efficiency columns (means over the **passing** runs
only, §4): `tok` mean `totalTokenCount` · `rt` mean round-trips · `ms` mean wall-clock · and the **list** /
**effective** cost (cache-blind / cache-aware). Below the per-tier tables, an **efficiency summary** aggregates
the scenarios **both** designs pass:

```
━━━━━ BENCHMARK · model=gemini-2.5-flash · N=5 ━━━━━
scenario            design         pass   req(mean)   tok     rt   ms      $list    $eff     notes
T4.build-pipeline   strategy-1     5/5    4/4         18.4k   9    22.1s   0.0031   0.0022   —
T4.build-pipeline   strategy-2     4/5    3.6/4       12.1k   5    17.8s   0.0021   0.0013   1 run: forgot to wire preview
                    ▶ correctness: strategy-1 (5/5 vs 4/5) · efficiency: strategy-2 (−34% tok, −44% rt)
...
━━━ EFFICIENCY (scenarios BOTH designs pass) ━━━
strategy-1     Σ 71.2k tok · 38 rt · 96s   ·  $list 0.012 / $eff 0.008
strategy-2     Σ 49.8k tok · 24 rt · 74s   ·  $list 0.009 / $eff 0.005   →  −30% tok, −37% rt
━━━━━ AGGREGATE ━━━━━
strategy-1     correctness 46/55
strategy-2     correctness 41/55
```

The verdict is **two-part** (§3): the correctness winner by pass-rate (requirement-rate tie-break), **then** the
efficiency winner among the co-correct, ranked on `tok`/`rt` (the trusted axes) — cost and `ms` are shown but
never fold into the ranking. Persist the raw `ScorecardCell[]` — now including the cost/time fields — to JSON so
two benchmark runs (before/after a prompt or design change) are diffable; the `bench-runs/` mechanism
(timestamped + `latest.*`) is otherwise unchanged.

---

## 7 · Reused vs. new

|                                     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Reused as-is**                    | `runScenario` / `TurnResult`, `parseOutcome` / `TurnOutcome`, `makeInitialGraph` / `createFixtureCatalog` / `IDS` / `nodeById`, the `makeGateway(agentType)` seam, the recording gateway, the oracle discipline + the whole scenario ladder, the live Gemini gateway, the `bench-runs/` persistence, the `RUN_LIVE` gate + per-case selectability.                                                                                                                                                                                         |
| **New — product code (two, small)** | (1) `renderContext` renders the routing rule from the roster it already holds — `BLOCK_RULE` unless the roster is builder-exclusive, then `BUILDER_RULE` (`orchestratorAgent.ts`, §0). (2) surface `totalTokenCount` + `cachedContentTokenCount` (+ thinking) on `Chunk.usage` and in `GeminiLlmGateway` — a ~3-field read — so cost captures thinking tokens **and** the implicit-cache discount (§4.3).                                                                                                                                  |
| **New — test-only**                 | `RunAdapter` + the two adapters, the `fanoutRoster` / `builderRoster` pair, the `Scenario` catalog + shared oracles (§5), the `Meter` + metering wrapper (a decorator **composed** with the existing recorder), `TurnCost` / `elapsedMs` on `BenchmarkResult`, `runBenchmark` + the pass-rate/efficiency aggregation, the scorecard writer (cost/time columns + efficiency summary), the offline Meter + isolation tests, and one tiny `runScenario` hook (pass a `roster` through to `createOrchestratorAgent`, which already takes one). |

Both product changes leave the default (production) roster and Strategy 1 byte-for-byte the same — the routing
gate fires only for a builder-**exclusive** roster, and the usage fields are additive — so `roster.ts` and
`subAgentRunner.ts` are untouched and the runner's catalog fallback stays (the §0 residual, transcript-guarded).
Everything else is test-only and carries no duplication: metering is a decorator composed with the existing
recorder, the `Meter` is a provider-neutral accumulator, and pricing is a single pure `price()` (§4.2). Nothing
touches `BaseAgent`, the specialists, or the tools — the benchmark observes the shipped agent through seams it
already has, which is why the two designs can be compared honestly.

---

Behavior & the loop: **[harness-spec.md](./harness-spec.md)**. Single-design verification & oracle rules:
**[harness-scenarios.md](./harness-scenarios.md)**. Types: **[harness-interfaces.md](./harness-interfaces.md)**.
