# Flow-agent eval — benchmarking two designs (tokens · correctness · time)

> A **design-agnostic** benchmark: one fixed ladder of scenarios (simple → complex), each verified by code,
> run identically against **two agent designs** so we can compare **tokens**, **correctness**, and **time**
> on the same footing. This page is the spec for that benchmark — the scenario catalog, the oracle
> discipline, the instrumentation seam, and the comparison protocol.
>
> **Grounding.** Built on what ships in `@flows/agent` today: `runScenario` / `TurnResult`
> (`libs/agent/src/__tests__/harness/runScenario.ts`), the `CanvasBinding` graph model
> (`Graph = WorkflowState = { nodes: NodeData[]; edges: EdgeData[] }`), the `LlmGateway` seam with
> `Chunk.usage` (`libs/agent/src/llm/llmGateway.ts`), and the fixture graph + catalog
> (`libs/agent/src/__tests__/harness/fixtures.ts`). Behavior & the loop: **[harness-spec.md](./harness-spec.md)**;
> how we verify a single design: **[harness-scenarios.md](./harness-scenarios.md)**; types:
> **[harness-interfaces.md](./harness-interfaces.md)**. Last updated 2026-07-30.

---

## 0 · The one idea that makes the comparison fair

**A scenario is a pure triple `(objective, initialGraph, oracle)` and knows nothing about the design under
test.** The oracle reads only the three public observables of a turn — `outcome`, the post-turn `graph`, and
`committed` — never any agent internals. So the _same_ scenario runs unchanged against either design; the only
per-design code is a thin **adapter** that turns an objective + a graph into those three observables plus a
cost record.

```
scenario  ─────────────►  RunAdapter (design A | design B)  ─────────────►  { outcome, graph, committed } + CostReport
(objective, graph)                                                           └── oracle reads these ──► pass / fail
```

This is the whole discipline: **correctness lives in the oracle (shared), cost lives in the instrumentation
(shared), and only the adapter differs.** If a metric could only be produced by peeking inside one design,
it is not a fair metric and does not belong here.

> **The two designs.** This spec is written so it does not care _what_ the two designs are — Design A is the
> shipped orchestrator-plus-specialists multi-agent harness (`runScenario`), Design B is whatever alternative
> we are evaluating (e.g. a single code-writing agent in the n8n "BUILD" shape). Each is wrapped once in a
> `RunAdapter`; everything below is identical for both. The **sub-agent count** metric is simply `0` for a
> single-agent design — it is not a special case, just a number that happens to be zero.

---

## 1 · The adapter contract

```ts
// The ONLY per-design code. Both designs implement this. It must be a black box: given an objective over a
// graph, produce the three observables the oracle reads, plus the cost record the instrumentation gathered.
interface RunAdapter {
    readonly designId: string; // 'multi-agent' | 'single-agent' — labels the scorecard
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
    committed: boolean; // did the live graph change this turn
    cost: CostReport; // §3 — gathered by the metering gateway, NOT design-specific fields
}
```

**Design A's adapter is a one-liner over the shipped harness** — `runScenario` already returns
`{ outcome, graph, committed }`; the adapter only adds the metering wrapper (§4) around `makeGateway` and
attaches the `CostReport`:

```ts
const multiAgentAdapter: RunAdapter = {
    designId: 'multi-agent',
    async run({ objective, initialGraph, userPermissions, catalog }) {
        const meter = createMeteringHarness(agentType => baseGateway()); // §4
        const started = clock.now();
        const { outcome, graph, committed } = await runScenario({
            objective,
            initialGraph,
            userPermissions,
            catalog,
            makeGateway: meter.makeGateway, // the seam runScenario already exposes
        });
        return { outcome, graph, committed, cost: meter.report(clock.now() - started) };
    },
};
```

Design B implements the same interface over its own entry point. If Design B does not expose an
`{ outcome, graph, committed }` surface, the adapter derives them the same way `runScenario` does — read the
final graph from its binding, diff it against a clone of `initialGraph` for `committed`, and re-ask the model
once for the `TurnOutcome` JSON (`parseOutcome`). **Both designs must derive `outcome` the identical way** so
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

The scorecard (§7) reports the **requirement pass-rate per clause** for T4/T5, so a design's failure is
localized to _which_ invariant it broke — far more actionable than a single number.

---

## 3 · What we measure — the `CostReport`

Every run yields the same record. Nothing here reads design internals — all of it comes from the two seams
every design shares: the **gateway** (each LLM round-trip flows through it) and the **wall clock**.

```ts
interface CostReport {
    // ── tokens (the primary $ axis) ─────────────────────────────────────────
    inputTokens: number; // Σ usage.inputTokens over every chat() call, all agents
    outputTokens: number; // Σ usage.outputTokens
    totalTokens: number; // inputTokens + outputTokens

    // ── work done (why the tokens were spent) ───────────────────────────────
    llmCalls: number; // number of chat() invocations — the LLM "steps" / round-trips
    subAgents: number; // specialist spawns (0 for a single-agent design — not special-cased)
    toolCalls: number; // tool dispatches across all agents (from the transcript)
    retries: number; // chat() calls that errored and were retried (0 if the loop doesn't retry)

    // ── time ────────────────────────────────────────────────────────────────
    wallClockMs: number; // end-to-end around the adapter's run() — what a user feels
    modelMs: number; // Σ latency of each chat() — model time, isolates network/model from harness overhead

    // ── per-agent breakdown (diagnostic; the multi-agent design's shape) ─────
    byAgent: Record<string, { llmCalls: number; totalTokens: number; modelMs: number }>;
}
```

**Why these and not others.**

- **`totalTokens`** is the headline cost — it is what the bill tracks and what a bloated system prompt, a
  chatty tool protocol, or an over-eager re-read shows up in.
- **`llmCalls`** and **`subAgents`** _explain_ the token number: a multi-agent design pays a fresh system
  prompt + graph context on every specialist turn, so it will spend more tokens for the same edit — this is
  exactly the trade the benchmark exists to quantify. Splitting them out means a regression is diagnosable
  ("+2k tokens because it now spawns twice") not just visible.
- **`modelMs` vs `wallClockMs`** separates _"the model/network was slow"_ from _"the design serializes work"_.
  A multi-agent design that fans out concurrently can have `modelMs ≫ wallClockMs`; a serial one has them
  close. Comparing both tells you whether a design's latency is inherent or just poor parallelism.
- **The eval's test-only outcome re-ask is excluded** from the cost. It is a harness artifact both adapters
  incur identically; counting it would tax both designs equally but muddy the number. The metering harness
  stops accumulating before the re-ask (§4) so `CostReport` reflects only the _work_ turn.

**Fake vs live.** The fake gateway emits no `usage` (confirmed: `createFakeGateway` streams text/tool-calls
only). So **token and time metrics are only meaningful on a live run** (real Gemini populates `usageMetadata`
→ `Chunk.usage`). Correctness can be checked deterministically with scripts, but the _cross-design cost
comparison must be live_. This is stated plainly so nobody reports "0 tokens" from a fake run as a win.

---

## 4 · The instrumentation seam — a metering gateway

Mirrors `verboseGateway.ts` (a pure pass-through wrapper) but accumulates instead of printing. **Zero product
code changes**: it wraps the `LlmGateway` at the `makeGateway(agentType)` seam `runScenario` already exposes.

```ts
// Wrap the per-agent gateway factory. Each agent (orchestrator + every spawned child) gets its OWN wrapper,
// all writing into one shared accumulator — so tokens/calls aggregate across the whole multi-agent turn while
// `byAgent` keeps the per-specialist breakdown. Sub-agent count falls straight out of how many times the
// factory is invoked for a non-orchestrator agentType (runScenario calls gatewayFor(spec.agentType) once per
// spawned child — subAgentRunner.ts), so we never inspect the transcript to count spawns.
const createMeteringHarness = (inner: (agentType: string) => LlmGateway) => {
    const acc = { input: 0, output: 0, calls: 0, modelMs: 0, retries: 0, spawns: 0 };
    const byAgent: Record<string, { llmCalls: number; totalTokens: number; modelMs: number }> = {};
    let live = true; // flipped false before the outcome re-ask so it isn't billed (§3)

    const makeGateway = (agentType: string): LlmGateway => {
        if (agentType !== 'orchestrator') acc.spawns += 1; // one factory call == one specialist
        const stats = (byAgent[agentType] ??= { llmCalls: 0, totalTokens: 0, modelMs: 0 });
        const g = inner(agentType);
        return {
            capabilities: g.capabilities,
            async *chat(req, opts) {
                if (!live) return yield* g.chat(req, opts); // re-ask turn: pass through, don't bill
                const t0 = clock.now();
                acc.calls += 1;
                stats.llmCalls += 1;
                for await (const chunk of g.chat(req, opts)) {
                    if (chunk.usage) {
                        acc.input += chunk.usage.inputTokens ?? 0;
                        acc.output += chunk.usage.outputTokens ?? 0;
                        stats.totalTokens += (chunk.usage.inputTokens ?? 0) + (chunk.usage.outputTokens ?? 0);
                    }
                    yield chunk;
                }
                const dt = clock.now() - t0;
                acc.modelMs += dt;
                stats.modelMs += dt;
            },
        };
    };

    return {
        makeGateway,
        endWorkTurn: () => (live = false), // call right before runScenario's outcome re-ask
        report: (wallClockMs: number): CostReport => ({
            inputTokens: acc.input,
            outputTokens: acc.output,
            totalTokens: acc.input + acc.output,
            llmCalls: acc.calls,
            subAgents: acc.spawns,
            toolCalls: 0 /* filled from the session transcript — count assistant toolCalls */,
            retries: acc.retries,
            wallClockMs,
            modelMs: acc.modelMs,
            byAgent,
        }),
    };
};
```

Two small hooks make the numbers honest:

- **`toolCalls`** is counted from the persisted transcript after the turn (sum of `toolCalls.length` over
  assistant messages in every agent's `SessionState`), not from the gateway — a gateway wrapper can't see how
  many _tools_ a single response fired. `runScenario` already holds the `storage`; expose it or fold the count
  into the adapter.
- **`endWorkTurn()`** is called between `orchestrator.send(objective)` and the outcome re-ask so the re-ask's
  tokens are excluded (§3). This requires either a one-line hook in `runScenario` or having the adapter drive
  the two `send` calls itself; either is a test-only change.

---

## 5 · The comparison protocol (fighting non-determinism)

A live model is stochastic — one run is an anecdote. The protocol turns anecdotes into a verdict.

1. **Same everything but the adapter.** Same model + `temperature: 0`, same `initialGraph` (deep-cloned per
   run), same catalog, same `userPermissions`, same timeout. Only `RunAdapter` differs. (`temperature: 0` is
   already the live-spec default; it does not remove non-determinism but shrinks it.)
2. **N runs per (scenario × design).** Default `N = 5`. Discard a single warm-up run per design (JIT / cold
   connection) before timing.
3. **Correctness = pass-rate**, the fraction of the N runs whose oracle passes. This is the primary axis —
   a design that is cheaper but wrong loses. Report it as `k/N`, not a boolean.
4. **Cost & time = median (p50) over the N runs**, reported alongside p90 (tail matters for latency and for a
   run that spirals into extra tool calls). Compute cost stats over **all** runs, and separately over **only
   the passing** runs (a cheap-but-failing run shouldn't flatter the median).
5. **Verdict per scenario:** rank by (a) pass-rate, then (b) median `totalTokens`, then (c) median
   `wallClockMs`. A design "wins" a scenario only if it is at least as correct; cost never buys correctness.
6. **Aggregate** across the ladder with tier weighting if desired (complex tiers are where designs diverge),
   but always report the per-tier and per-scenario breakdown — an aggregate that hides "Design B is 3× cheaper
   on T0 but fails every T4 build" is a lie.

```ts
interface ScorecardCell {
    scenarioId: string;
    designId: string;
    passRate: string; // 'k/N'
    tokens: { p50: number; p90: number; p50Passing: number };
    wallClockMs: { p50: number; p90: number };
    modelMs: { p50: number };
    llmCalls: { p50: number };
    subAgents: { p50: number };
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

## 6 · The scenario ladder (simple → complex)

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

## 7 · Reporting — the scorecard

Print one table per tier and one aggregate, both designs side by side, mirroring the `afterAll` scorecard in
`integration.live.spec.ts` but with the cost columns:

```
━━━━━ BENCHMARK · model=gemini-2.5-flash · N=5 ━━━━━
scenario            design         pass   tok(p50)  tok(p90)  llm  sub   wall(p50)  model(p50)
T4.build-pipeline   multi-agent    5/5      12_400    15_100   9    3       8_200ms     7_100ms
T4.build-pipeline   single-agent   4/5       6_800     8_050   4    0       5_400ms     5_100ms
                    ▶ winner: single-agent (both correct enough; 45% fewer tokens, 34% faster)
...
━━━━━ AGGREGATE (pass-weighted) ━━━━━
multi-agent    correctness 46/55   tokens 187k   wall 214s
single-agent   correctness 41/55   tokens  98k   wall 141s
```

The winner line is computed by §5's ranking (correctness first). Persist the raw `ScorecardCell[]` to JSON so
two benchmark runs — before/after a prompt or design change — are diffable.

---

## 8 · Reused vs. new

|                                            |                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reused as-is**                           | `runScenario` / `TurnResult`, `parseOutcome` / `TurnOutcome`, `makeInitialGraph` / `createFixtureCatalog` / `IDS` / `nodeById`, the `makeGateway(agentType)` seam, the oracle discipline, `Chunk.usage` on the Gemini gateway, the `RUN_LIVE` gate + per-case selectability.                                                                         |
| **New (all test-only, no product change)** | `RunAdapter` + the two adapters, `createMeteringHarness` (the metering gateway, modeled on `verboseGateway`), the `Scenario` catalog + shared oracles (§6), `runBenchmark` + the p50/p90 aggregation, the scorecard writer, and two tiny `runScenario` hooks (`endWorkTurn` boundary before the re-ask; expose `storage` for the `toolCalls` count). |

Nothing here touches `BaseAgent`, the specialists, or the tools — the benchmark observes the shipped agent
through seams it already has, which is the whole reason the two designs can be compared honestly.

---

Behavior & the loop: **[harness-spec.md](./harness-spec.md)**. Single-design verification & oracle rules:
**[harness-scenarios.md](./harness-scenarios.md)**. Types: **[harness-interfaces.md](./harness-interfaces.md)**.
