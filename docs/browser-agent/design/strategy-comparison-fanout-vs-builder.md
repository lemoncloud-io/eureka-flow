# Report — Strategy 1 (fan-out) vs Strategy 2 (builder)

**What this compares.** Two agent designs for the same flow-building task, on the same scenarios, scored by the
same oracle:

- **Strategy 1 — fan-out.** A write-free **orchestrator** plans, then delegates each block to a narrow
  per-block **specialist** (add / configure / connect / delete), routing via `AgentCard`.
- **Strategy 2 — builder.** A single **composition agent** holding the whole plan in one context, with the full
  editing toolset plus on-demand skills.

**Data.** `bench-runs/eval-benchmark_gemini_gemini-2.5-flash_N3_2026-08-04T14-31-28-627Z` — Developer API,
`gemini-2.5-flash`, **N=3**, scenarios **T4–T8** (the run started at T4; T0–T3 were not run this pass). Dollar
derivation and the billing reconciliation live in the companion
[`gemini-grouping-and-cost-verification.md`](./gemini-grouping-and-cost-verification.md); this report is the
comparison.

**Read the numbers as directional, not precise** — see [Validity](#validity) (temp=0 is non-deterministic on
2.5 Flash; two cells were lost to network errors; the run predates the tool-result grouping fix).

---

## The headline

|                                   | Strategy 1 — fan-out                                                                          | Strategy 2 — builder |
| --------------------------------- | --------------------------------------------------------------------------------------------- | -------------------- |
| **Correctness** (T4–T8, 18 cells) | 14/18 — but **2 losses were network errors** (`fetch failed`), so **14/16** on cells that ran | **17/18**            |
| **Tokens** (Σ 6 both-pass cells)  | **225.1k**                                                                                    | 284.7k               |
| **Round-trips**                   | 142.3                                                                                         | **85.3**             |
| **Wall-clock**                    | **125.4s**                                                                                    | 162.7s               |
| **$list** (cache-blind)           | **0.1102**                                                                                    | 0.1226               |
| **$eff** (cache-aware)            | **0.1002**                                                                                    | 0.1031               |

**The result inverts the naive expectation.** One would expect fan-out — more agents, "specialists" — to buy
**higher accuracy at higher cost.** It delivered the opposite: **lower accuracy _and_ lower cost.** The two
sections below explain each half.

---

## Why fan-out is _cheaper_ — the re-send tax

Cost here is almost entirely **input** tokens, not output — the model re-reads a growing context each
round-trip:

| Σ over 6 both-pass cells | fan-out      | builder      | Δ                |
| ------------------------ | ------------ | ------------ | ---------------- |
| **input** tokens         | 205.7k (91%) | 267.8k (94%) | builder **+30%** |
| **output** tokens        | 19.4k        | 16.9k        | builder **−13%** |
| **cached** tokens        | 37.1k        | 72.3k        | builder **≈2×**  |

The mechanism:

- The **builder holds one context that grows every round-trip** — each call re-sends the whole accumulated
  transcript. Fewer round-trips (85 vs 142), but each carries more. That is the **+30% input** and the entire
  cost gap; the builder actually emits **fewer** output tokens (−13%), it just re-reads more.
- **Fan-out spawns many small, fresh contexts** (one per specialist call), so its per-call input stays small
  even though it makes far more calls.

**Two offsets of similar size shrink the token gap to almost nothing — caching is only half of it:**

|                    | token gap | $list (cache-blind) | $eff (cache-aware) |
| ------------------ | --------- | ------------------- | ------------------ |
| fan-out vs builder | **−21%**  | **−10%**            | **−3%**            |

- **−21% → −10% is output-rate weighting, not caching.** Output bills at **$2.50/M — 8.3× the $0.30/M input
  rate** — so although output is a tiny _count_ (~7%), it is ~half the _dollars_. Fan-out emits **more** output
  (19.4k vs 16.9k), and that penalty eats most of its input-token win **before caching enters** ($list, which
  prices all input at the standard rate, still shows only −10%).
- **−10% → −3% is caching.** The builder re-sends a large constant prefix (its system prompt + folded-in
  skills) across many round-trips, so a higher share of its input is cached (27% vs 18%) — cache-aware pricing
  rescues it further.

Absolute reconciliation: fan-out's raw input win ≈ +$0.019 (cache-blind) − output penalty $0.006 − builder's
extra caching $0.010 = net **+$0.003** (the −3%). In real dollars the two cost about the same; the −21% raw
token figure is the one to _not_ read as a cost verdict.

---

## Why fan-out is _less accurate_ — the coordination tax

Fan-out's "specialists" are the **same `gemini-2.5-flash`** with narrower prompts — **not a more capable
model.** Narrowing the prompt does not make the sub-agent better at its slice; it only moves work onto the
**orchestrator**, which must now decompose the request, thread freshly-created node-ids between specialists,
sequence dependent steps, and pair each edge's source with its target. That coordination is pure overhead with
no capability upside.

The scorecard bears this out:

- **Simple / single-subgraph cells are ties** — T4 (build-pipeline), T6 (branch-fanout), T7 (multi-edit) all
  3/3 vs 3/3. When there's little to coordinate, the two designs are indistinguishable.
- **The one clean design difference is the most decomposition-heavy cell — T8 (two independent pipelines):**
  builder **3/3**, fan-out **2/3**. Fan-out's miss (run2) built **one** pipeline instead of two — the
  orchestrator declared done having dropped a whole requested subgraph. The builder, holding both pipelines in
  one plan, didn't lose track.
- **T7.double-insert is a tie of _different_ failure modes** — both 2/3. Fan-out's miss was a wiring-order
  thrash (connect-before-free / partial path); the builder's miss was a **hallucinated completion** ("the
  canvas already contains… correctly wired" when it wasn't — judged done from memory, not from the canvas).

**The crux: specialization raises accuracy only when the specialist is genuinely more capable than the
generalist.** Here it isn't (same model, narrower prompt), so fan-out pays a coordination-failure risk to buy a
token saving that caching mostly erases.

---

## Correctness — the honest read

The raw 14 vs 17 **overstates** the gap. Correcting for cause:

| Cell              | fan-out | builder | What actually happened                                                                                                    |
| ----------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| T4.build-pipeline | 3/3     | 3/3     | tie                                                                                                                       |
| T5.insert-between | 1/3     | 3/3     | **not a design difference** — fan-out's 2 losses were `fetch failed` network errors; its one run that executed **passed** |
| T6.branch-fanout  | 3/3     | 3/3     | tie                                                                                                                       |
| T7.multi-edit     | 3/3     | 3/3     | tie                                                                                                                       |
| T7.double-insert  | 2/3     | 2/3     | tie — fan-out thrash vs builder hallucination (one genuine miss each)                                                     |
| T8.two-pipelines  | 2/3     | 3/3     | **the one clean difference** — fan-out dropped a pipeline (coordination)                                                  |

Genuine logic misses: **fan-out 2** (T7.double thrash, T8 dropped pipeline — both coordination-flavored),
**builder 1** (T7.double hallucinated completion). One mild structural point: fan-out's **higher call volume**
(142 vs 85 round-trips) gives it **more exposure to transient `fetch failed`** — the network losses aren't
purely random, the architecture amplifies them.

---

## Do both work as designed? Yes

- **Fan-out** behaves per design: the orchestrator stays write-free, plans, and delegates to narrow per-block
  specialists via `AgentCard`; specialists own their block's schema and edits. It ties the builder on 4 of 6
  cells.
- **Builder** behaves per design: one composition agent holds the whole plan, uses the full toolset + skills,
  and finishes multi-node builds. 17/18.

Neither design is broken. The finding isn't a bug — it's that the **intended trade-off doesn't hold for
same-model specialization**: you don't get the accuracy-for-cost swap you'd expect; you get the inverse.

---

## What each could improve

**Fan-out**

1. **Coordination completeness on independent subgraphs (T8).** The orchestrator finished with 1 of 2 requested
   pipelines. The leverage fix is a **structural completeness check** — before declaring done, verify the final
   graph contains every requested subgraph, and re-delegate the gaps. (Same guard the builder needs; see below.)
2. **Reroute/insert ordering (T7.double).** Enforce remove-before-reuse so an insert doesn't connect-before-free
   (partly landed).
3. **Cell-level retry for transient `fetch failed` (T5).** The HTTP-layer retry didn't catch these; wrapping the
   whole cell run would stop network blips from scoring as correctness misses.

**Builder**

1. **Judge completion from the canvas, not memory (T7.double).** A prompt fix landed (decide done from the
   node/edge lists seeded each turn). The robust fix is the same **structural post-check** as fan-out #1: the
   runner/orchestrator diffs the returned graph against the plan and re-delegates gaps. This one guard fixes the
   genuine miss on _both_ designs — the highest-leverage change on the board.
2. **Trim the re-sent context (the +30% input).** Each round-trip re-sends the whole transcript of prior tool
   calls + results ([`baseAgent.ts:232-236`](../../../libs/agent/src/agents/baseAgent.ts#L232), part `(C)`);
   across the builder's ~9–23 round-trips that accumulation is the +30%. Pruning stale observations would shrink
   it — and, contrary to an earlier note, it does **not** conflict with the completion-grounding fix: that fix
   reads the canvas seed `(B)`, re-rendered fresh from the binding each turn, **not** the transcript `(C)`. The
   real risk is dropping working memory the canvas doesn't capture (the original plan, chosen config, progress
   notes), so a safe prune keeps system + user request + recent results and summarizes the rest. Low priority
   regardless: the whole re-send tax is only −10% cache-blind / −3% cache-aware, so there is little real cost to
   chase. The structural post-check (#1) is the higher-leverage builder fix.

---

## Verdict

For **this task and this model**, the **builder is the better default**: higher correctness (17/18 vs an honest
14/16), and — once caching is on — **statistically the same real cost** ($eff −3%, inside the noise). Fan-out's
appeal (more, "smaller" agents) doesn't pay off because the sub-agents aren't more capable than the generalist;
you inherit coordination risk for a token saving caching erases.

Fan-out becomes the right call only if one of its premises changes: the specialists become a **genuinely
stronger/cheaper model** than the composer (then specialization buys real capability), or the workload is
**embarrassingly parallel** with little cross-agent state to thread (then the coordination tax shrinks). Neither
holds on these scenarios.

---

## Validity

- **temp=0 is not deterministic** on 2.5 Flash (thinkingBudget on, no seed) — proven this session by
  T7.double-insert diverging on byte-identical code. So a single run is noise; N=3 is the floor, and cells
  decided by one flip (T7.double for both, T8 for fan-out) are the least certain.
- **Two fan-out cells were network-lost** (`fetch failed` on T5), so the raw correctness gap overstates the real
  one — corrected above.
- **The run predates the tool-result grouping fix**
  ([companion report §1](./gemini-grouping-and-cost-verification.md)). Single-tool-call turns are unaffected;
  multi-call turns (most of an agentic loop) could shift marginally on a re-run. Treat these as the current best
  estimate, not a frozen result.
- **Small N, six scenarios.** The robust, repeatable claims are the two mechanisms (re-send tax → fan-out
  cheaper in raw tokens but ~equal in cache-aware $; coordination tax → builder ≥ fan-out on
  decomposition-heavy cells). The exact per-cell pass counts are within noise.
