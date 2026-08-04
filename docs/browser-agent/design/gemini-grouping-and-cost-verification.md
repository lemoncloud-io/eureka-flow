# Report — tool-result grouping (both APIs) + cost verification

**Status:** results + derivations (companion to [`vertex-migration.md`](./vertex-migration.md)).
**Scope:** the Gemini gateway's tool-result encoding, how the benchmark derives `$`, and a reconciliation of
our metering against the real Vertex billing page. No agent-behavior claims here — this is the plumbing.

**Grounding:** every code reference below is a live line at the time of writing —
`libs/agent/src/llm/GeminiLlmGateway.ts`, `libs/agent/src/__tests__/harness/metering.ts`, and the pinned test
`libs/agent/src/__tests__/llm/GeminiLlmGateway.spec.ts`. The billing figures are read from the GCP Cloud
Billing "Reports" view for the trial project (`eureka-flow`), first billing month.

---

## 1. Tool-result grouping now applies to both the Developer API and Vertex

### The invariant

Gemini's `generateContent` requires that **the number of `functionResponse` parts answering a model turn
equals the number of `functionCall` parts in that turn.** A model turn that fired _N_ parallel tool calls must
be answered by **one** `user` content carrying _N_ `functionResponse` parts — not _N_ separate `user` contents.

### The bug and the fix

The gateway previously emitted **one `user` content per tool result** (N calls → N separate contents). That
split:

- **Vertex** rejects with `400 — "Please ensure that the number of function response parts is equal to the
number of function call parts"`.
- The **Developer API tolerated** the split, which is why it never surfaced until the Vertex run.

The fix groups consecutive tool results into a single `user` content, in the shared request builder
`toGeminiRequest` — [`GeminiLlmGateway.ts:165-178`](../../../libs/agent/src/llm/GeminiLlmGateway.ts#L165):

```
if (last?.role === 'user' && last.parts[0]?.functionResponse !== undefined) {
    last.parts.push(part);            // append to the open tool-result turn
} else {
    contents.push({ role: 'user', parts: [part] });   // start a new one
}
```

### Why this is "on the Developer API too" — by construction, not by a second change

The fix is **unconditional** (no `provider` branch) and lives in the one body-builder both providers share:

| Factory                              | Line   | Builds from                      | → request built by       |
| ------------------------------------ | ------ | -------------------------------- | ------------------------ |
| `createGeminiLlmGateway` (Developer) | `:414` | `createGeminiCoreGateway` `:248` | `toGeminiRequest` `:270` |
| `createVertexLlmGateway` (Vertex)    | `:428` | `createGeminiCoreGateway` `:248` | `toGeminiRequest` `:270` |

Both factories differ **only** in transport (endpoint URL + auth). The request shape — including grouping —
is written once. So the Developer path groups too; there is no separate Developer code to add.

**Proven by test, through the Developer factory.** `GeminiLlmGateway.spec.ts:181` ("groups parallel tool
results into ONE user content") drives `createGeminiLlmGateway` — the **Developer** factory — with two parallel
`add_node` calls and asserts the request carries a single `user` content with two `functionResponse` parts. So
Developer grouping is not merely shared-by-code; it is covered by an assertion that runs the Developer path.

### Scope and caveat

- **Only multi-tool-call turns change.** A single tool call is one result → one content, byte-identical before
  and after. The common path is untouched, so there is no regression surface on ordinary turns.
- **Same information, different packaging.** The model receives all _N_ results either way; only the turn
  boundary moves (N turns → 1 turn). Correctness logic is unaffected.
- **The N=3 Developer scorecard predates this fix.** Grouping landed during the Vertex attempt, so the earlier
  Developer numbers were produced on the _split_ shape. A Developer re-run now uses the _grouped_ shape;
  multi-call turns could shift marginally (temp=0 is already non-deterministic on 2.5 Flash), single-call turns
  are identical.

---

## 2. How the benchmark derives `$` (the cost columns)

### The token source is Google's own count

Every response — Developer or Vertex, same shape — carries a `usageMetadata` block. The gateway maps it to a
provider-neutral `Chunk.usage`; the `Meter` sums it across `chat()` calls
([`metering.ts:44-70`](../../../libs/agent/src/__tests__/harness/metering.ts#L44)):

| Meter counter  | From `usageMetadata`                | Note                                                                                      |
| -------------- | ----------------------------------- | ----------------------------------------------------------------------------------------- |
| `inputTokens`  | `promptTokenCount`                  | includes **re-sent history** — that _is_ what you're billed for each round-trip           |
| `cachedTokens` | `cachedContentTokenCount`           | input served from the implicit cache                                                      |
| `totalTokens`  | `totalTokenCount`                   | the stable, cache-independent ground-truth axis                                           |
| `outputTokens` | **derived** `max(0, total − input)` | so **thinking tokens are counted** (they fold into `total`, not the visible output field) |
| `roundTrips`   | count of `chat()` calls             | —                                                                                         |

The load-bearing point: **we do not estimate tokens — we sum the exact counts Google returns.** The only thing
the benchmark _owns_ is the rate table.

### The rate table (same on both APIs)

[`metering.ts:78-80`](../../../libs/agent/src/__tests__/harness/metering.ts#L78), `gemini-2.5-flash`:

| Rate                        | $/M tokens                                                            |
| --------------------------- | --------------------------------------------------------------------- |
| input (`inPerM`)            | **$0.30**                                                             |
| output (`outPerM`)          | **$2.50**                                                             |
| cached input (`cachedPerM`) | **$0.03** (90% off input; 2.5 implicit-cache minimum is 2,048 tokens) |

### The two `$` columns ([`metering.ts:83-92`](../../../libs/agent/src/__tests__/harness/metering.ts#L83))

```
nonCached     = max(0, inputTokens − cachedTokens)
usdList       = (inputTokens · 0.30           +                       outputTokens · 2.50) / 1e6
usdEffective  = (nonCached  · 0.30 + cachedTokens · 0.03 +            outputTokens · 2.50) / 1e6
```

- **`usdList` (cache-blind)** prices _all_ input at the full rate. Stable, apples-to-apples across runs — the
  number to compare two designs by.
- **`usdEffective` (cache-aware)** discounts the cached input. Closer to real spend, but noisy: cache hit-rate
  depends on timing and ordering, so it's not a clean A/B axis.

Because the tokens are Google's own count and the rates are Google's published sheet,
**`$ = (Google's tokens) × (Google's rates)`** — our figure should reconcile to Google's billing up to (a) FX
and (b) which requests are counted (see §3).

---

## 3. The Vertex billing page — read and reconciled

The page **is not empty** — it's credit-netted. First-month "Reports" view for `eureka-flow`:

| Service   | Usage cost | Savings programs | Other savings | Subtotal | % Change |
| --------- | ---------- | ---------------- | ------------- | -------- | -------- |
| Vertex AI | **₩221**   | —                | **−₩221**     | **₩0**   | New      |

Reading it:

- **`Usage cost` = ₩221** — real, metered spend. Gemini 2.5 Flash on Vertex is a **paid** model; this column
  proves it was charged at the normal rate.
- **`Other savings` = −₩221** — the **$300 trial credit** absorbing the charge.
- **`Subtotal` = ₩0** — net after the credit. **This ₩0 is what looked like "nothing."**
- The chart is a flat line because ₩221 is invisible at its scale; **"New"** = first billing month.

### "Is it because Flash is free?" — no, it's the credit

The two are different mechanisms, and the screenshot distinguishes them:

- **Free tier** would show **₩0 in `Usage cost` itself** — nothing metered, nothing to reverse.
- **Trial credit** (what's happening) shows the model **metered at ₩221 in `Usage cost`**, then a **separate
  `Other savings −₩221`** reversing it.

A genuine free tier _does_ exist — but only on the **AI Studio Developer API**, which is precisely the surface
the $300 credit does **not** cover. That mismatch is the whole reason for the Vertex migration
([`vertex-migration.md` §Why](./vertex-migration.md)). On Vertex, Flash is billed; the credit just pays.

### Order-of-magnitude sanity check

₩221 ≈ **$0.16** (GCP converts USD→KRW at its own monthly rate, roughly ₩1,300–1,400/USD). That is the gross
across **all** Vertex requests that reached the model this month — a handful of successful cells plus the
successful round-trips of cells that later failed. Consistent with our metering: the Vertex run was mostly
`429`/`400`, so only a few cells' worth of tokens (order 10²–10³ k) were ever generated. The magnitude agrees.

### The one gotcha when reconciling to the cent

**Our scorecard `$` ≠ this ₩221**, by design:

- The **scorecard** meters **passing runs only** (misses excluded) and reports a per-cell _mean_ — it's an
  efficiency-of-success metric.
- **Billing** counts **every token every request generated**, including the successful round-trips of cells
  that were ultimately scored MISS/ERROR.

So the scorecard **undercounts** relative to billing. To reconcile exactly, sum the `Meter` over **all**
attempts (not the scorecard), and compare **tokens**, not currency (KRW has already had a USD→KRW FX applied
that you'd otherwise have to invert).

### How to actually verify cost — three currency-free views

Verify in **tokens**, then price once. The billing console is the _last_ place to look (laggy, credit-netted,
FX-converted); the real-time surfaces are:

1. **Per-response `usageMetadata`** — the exact tokens the `Meter` sums. Real-time, authoritative; this is what
   we already report.
2. **Cloud Monitoring** `aiplatform.googleapis.com/publisher/online_serving/token_count` — near-real-time
   (minutes). Sum over the run window; it should equal the `Meter`'s all-attempts `totalTokens`.
3. **Billing "Download CSV"** (top-right of the page) — breaks Vertex AI into per-SKU rows (Flash input/output
   token quantities). Those quantities should match (1) and (2); `quantity × published rate` should reproduce
   the ₩221 (up to FX).

If all three token counts agree and our `PRICES` match Google's sheet, the `$` is correct **by construction** —
regardless of what the credit-netted `Subtotal` shows.

---

## 4. What this means for the benchmark

- **Grouping is landed on both providers**, unconditional and tested through the Developer factory. Low
  regression surface (multi-call turns only).
- **The Vertex run is not a clean cost dataset** — it was mostly throttled (`429` DSQ / pre-fix `400`), so its
  token totals are partial. Use it to confirm the _protocol_ (fixed) and the _endpoint_ (works), not to compare
  design costs.
- **The Developer API remains the primary cost dataset** — but the reported N=3 Developer numbers predate the
  grouping fix (§1 caveat). A refreshed Developer run would sit on the grouped shape.
- **Billing confirms metering is sound in magnitude** (₩221 gross ≈ $0.16), and confirms the **trial credit is
  paying** (−₩221 → ₩0 net). Nothing is being charged to the card during the trial.
