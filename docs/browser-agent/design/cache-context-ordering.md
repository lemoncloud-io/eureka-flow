# Change note — cache-friendly context ordering (live canvas to the tail)

**Status:** design → conform. **Scope:** the base agent loop's message assembly, the builder's context hook,
and the Gemini gateway's user-content coalescing. Persona text, tools, and the oracle are untouched.

**Grounding:** the loop assembles each turn at [`baseAgent.ts:232-236`](../../../libs/agent/src/agents/baseAgent.ts#L232);
`buildContextMessages()` defaults to `[]` at [`baseAgent.ts:142`](../../../libs/agent/src/agents/baseAgent.ts#L142)
and the builder overrides it to emit the canvas at [`builderAgent.ts:123`](../../../libs/agent/src/agents/builderAgent.ts#L123);
`toGeminiRequest` folds every `system`-role message into `systemInstruction` and maps the rest to `contents`
([`GeminiLlmGateway.ts:149`](../../../libs/agent/src/llm/GeminiLlmGateway.ts#L149)).

## The principle

Prefix caching matches the **longest common prefix** of consecutive requests. So the request must be ordered
**[most stable … most volatile]**: anything constant across turns first, anything that changes every turn last.
The cache extends up to the first token that differs from the previous request.

## The bug

The builder injects the canvas via `buildContextMessages()` as a **`system`-role** message. The loop places it
right after the persona, and `toGeminiRequest` concatenates all `system` texts into one `systemInstruction`
block. So the request is:

```
systemInstruction = [ persona (constant) ] + [ canvas render (changes every turn) ]
contents          = [ transcript … ]
```

The volatile canvas is glued to the **end of the cached prefix**. The common prefix truncates where the canvas
begins — so only the persona caches, and the whole growing transcript (the re-send tax, ~90% of input) **never
caches**. This is why the builder's measured cache share was only 27% (persona re-hit), not the ~90% an
append-only history would give
([strategy report §re-send tax](./strategy-comparison-fanout-vs-builder.md)).

## The fix

Move the canvas from the **head** (systemInstruction) to the **tail** (last `contents` turn), and keep the
transcript frozen so it becomes an append-only, cacheable prefix.

1. **Base loop** — add a trailing hook `buildLiveObservation(): ChatMessage[]` (default `[]`), appended **after**
   the transcript:
    ```
    [ system persona ] · buildContextMessages() · mapTranscript(state.messages) · buildLiveObservation()
    ```
    `buildContextMessages()` keeps its meaning — **static** per-agent head (roster, capabilities), cached.
    `buildLiveObservation()` is the **volatile** tail, recomputed each turn.
2. **Builder** — the canvas moves from `buildContextMessages()` (→ now `[]`) to `buildLiveObservation()`, emitted
   as a **`user`-role** turn (`renderNodeContext` + `renderEdgeContext`). It is **ephemeral**: computed at build
   time, never persisted into `state.messages`, so the real transcript stays byte-frozen.
3. **Gateway** — `toGeminiRequest` **coalesces consecutive `user` contents** (generalizing the existing
   tool-result grouping): the trailing canvas turn rides the preceding tool-result turn as an extra `text` part,
   so role alternation is preserved (no two consecutive `user` contents).

### What caches after the fix

The frozen transcript is append-only, so from turn 2 on the cache covers **everything except the last
tool-result turn** (which differs only by the canvas `text` suffix appended this turn). The model still sees the
**current** canvas every turn — now at the tail, the strongest recency position — so completion-grounding (which
reads "the node/edge lists you're shown each turn") is preserved, arguably strengthened.

### The wire shape this produces (the one thing to validate live)

A tool-result turn becomes one `user` content mixing `functionResponse` parts and a trailing `text` part:

```
user: [ functionResponse{n1}, functionResponse{n2}, { text: "Current canvas: …" } ]
```

The grouping invariant is intact (functionResponse count still equals the model turn's functionCall count; the
`text` part is orthogonal). **Open question:** whether Gemini accepts `functionResponse` + `text` mixed in one
`user` content. Confirm with a live smoke. **Fallback if rejected:** fold the canvas into the last
`functionResponse`'s `response` payload (always valid JSON) — a one-line change at the coalescing point.

## Why the builder benefits most (others unchanged for now)

The builder is the single long-lived context (9–23 round-trips in one loop), so a cacheable transcript is worth
the most there. The orchestrator and specialists are short-lived (few round-trips each), so they cache little
either way; leaving their head-injected canvas in place keeps this change small. Generalize later if the probe
pays off — the base-loop hook already makes that a per-agent override.

## Measured result (N=3, Developer API)

Verified on T6 + T8 (the high-round-trip builds), builder **before (checkpoint N=3) → after (N=3)**:

| builder cell     | $eff                       | round-trips            | total tok         | cache-share   |
| ---------------- | -------------------------- | ---------------------- | ----------------- | ------------- |
| T6.branch-fanout | 0.0210 → **0.0098** (−53%) | 16.7 → **9** (−46%)    | 62.2k → **28.7k** | 25% → **31%** |
| T8.two-pipelines | 0.0295 → **0.0156** (−47%) | 22.7 → **13.7** (−40%) | 87.3k → **54.3k** | 23% → **49%** |

Correctness held (builder **3/3** on both — no regression). The builder is now **cheaper than fan-out** on both
cells (T6 $eff 0.0098 vs 0.0257; T8 0.0156 vs 0.0273): the cost verdict **flips** from the earlier ~−3% tie to
roughly **half** fan-out's cost.

**The mechanism was not (only) what this note predicted — two levers, in order of size:**

1. **Fewer round-trips (dominant, −40–46%) — unpredicted.** With the canvas at the tail (maximal recency, right
   before the model acts), the model trusts the shown state and issues fewer redundant `list`/`describe` reads.
2. **Better transcript caching (secondary, as designed).** Cache-share rose 25→31% (T6) and 23→49% (T8), the
   gain scaling with build length, because the frozen transcript is now an append-only prefix.

> **N=1 warning, logged.** The first probe read cache-share as **0%** and nearly sent me chasing a phantom
> "caching broke" bug. Implicit caching is best-effort and swings hard at N=1; only the N=3 average showed the
> real 31 / 49%. Baseline caveat: the before-N=3 also predates the grouping fix, but grouping is a wire-shape fix
> with no round-trip mechanism, so the tail-placement is the attributable cause.

## Approach 3 — pull instead of push (variant under comparison)

Approaches 1 (head) and 2 (tail) both **push** the whole canvas into context every turn. Approach 3 tests the
opposite: don't push at all. The starting graph rides the **first user message** (a one-time seed via
`initialUserPreamble`), and every agent gets a **`get_graph`** tool to **pull** the current canvas on demand.
The transcript stays append-only (pulled state arrives as frozen tool results), and per-turn tokens drop below
Approach 2 when the model pulls sparingly.

- **Top-level agents (builder, orchestrator)** seed the starting graph in their first user message and pull
  fresh state via `get_graph` as they work.
- **Spawned fan-out children** are not handed the graph; they share the live binding and pull `get_graph`
  themselves (the orchestrator's `task` already names the concrete ids to act on). Scoping the subgraph into each
  task — the n8n-scale answer — is deferred; children pull the whole graph for now.
- **Per-agent injection removed:** the builder's `buildLiveObservation`, and the canvas half of every
  specialist's / the orchestrator's `buildContextMessages` (block agents keep their static config schema; the
  orchestrator keeps its roster).

The risk it probes: the model may **over-pull** (defensive round-trips) or **under-pull** (act on stale state).
Measured against Approaches 1 and 2 on the T4+ ladder — results appended once the run lands.

**Retrievable commits:** Approach 1 = `809169b` (head), Approach 2 = `ea980b9` (tail), Approach 3 = this commit
(pull).

## Reused vs new

- **Reused, unchanged:** `renderNodeContext` / `renderEdgeContext`, `mapTranscript`, the completion-grounding
  persona, the metering Meter, every offline oracle.
- **New:** `buildLiveObservation()` base hook (default `[]`); the builder override; the gateway's consecutive-
  `user` coalescing (+ its scripted-HTTP test).
- **Edited:** the base loop's `chatMessages` assembly (one trailing spread); the builder's `buildContextMessages`
  (canvas removed) → `buildLiveObservation` (canvas added).
