# Flow-agent harness — how we verify

> How the harness's correctness is checked, and what makes a scenario well-formed. The scenarios
> themselves are **code, not prose** — this page explains the discipline they follow and points to where
> they live. Last updated 2026-08-02.

---

## Where the scenarios live (the code is the source of truth)

All under `libs/agent/src/__tests__/harness/`, each scenario over the **smallest graph it needs** (or the
shared `fixtures.ts` graph where a realistic multi-node canvas matters — see below). Every suite has a
**deterministic** variant (`.spec.ts`, always runs — fake `LlmGateway`, exact oracle, no key/network) and a
**live** variant (`.live.spec.ts` — real function-calling Gemini; opt-in via `describe.skipIf(SKIP_LIVE)`
where `SKIP_LIVE = !GEMINI_API_KEY || !RUN_LIVE`, so a key alone is not enough — `RUN_LIVE` must be set too;
the model chooses the calls, so a miss is a real signal, not a broken test). Live cases are
independent and selectable (`vitest run <file> -t <name>`), so a representative subset runs without the whole
matrix.

- **Per agent, no orchestrator** — `scenarios/<agent>.{spec,live.spec}.ts`: the agent driven **directly** with
  a concrete task, asserting the live graph — its definition of done. Block agents: `scenarios/blockAgent.*`
  (generic add/configure/delete + type-scoped `search_nodes`), `scenarios/singleOutputGenerator.*` (the
  `single-output-generator` specialist, incl. add+configure in one turn). Composition: `scenarios/builder.*` —
  the composition `builder` driven directly (no orchestrator) to build a whole flow in one sub-turn (add → wire
  → configure → repair, incl. `use_skill`).
- **Integration, orchestrator × agents** — `scenarios/integration.{spec,live.spec}.ts`: the orchestrator
  resolving a request and delegating across specialists (the applied/refused/answered matrix — `partial` is a
  production outcome but not a test target, see below). The live variant checks only the outcome + graph oracle.
- **Support** — `runScenario.ts` (the orchestrator runner + the test-only outcome re-ask), `fixtures.ts` (the
  shared 4-node graph for the integration cases, plus the fixture catalog and `nodeById`), `turnOutcome.ts`
  (the eval-only `TurnOutcome` + `parseOutcome`), `verboseGateway.ts`.

The per-agent roster + coverage map is [agents/README.md](../agents/README.md).

## How we verify correctness — the oracle

**Well-formedness ≠ correctness.** A `−20` move is well-formed but wrong for "nudge right", so each oracle
judges the intended **effect**, only as strict as the intent fixes it:

- **exact** where a value is pinned — `"model = gemini-2.5-pro"` ⇒ `config.model === 'gemini-2.5-pro'`;
- **relational** where it isn't — `"nudge right a bit"` ⇒ `x↑`, `y=`, never a magnitude.

The orchestrator ends its turn with a plain-text message; nothing lands via a report step. The `TurnOutcome`
the oracle reads is produced **test-only** — `runScenario` re-asks the orchestrator for the turn's outcome as
JSON and parses it (there is no `finish` tool in production). Each status carries an invariant the oracle
enforces:

| status                 | `committed` | final `graph`                                      |
| ---------------------- | ----------- | -------------------------------------------------- |
| `applied`              | `true`      | changed as intended                                |
| `partial`¹             | `true`      | successful edits applied; `failed` non-empty       |
| `refused` / `answered` | `false`     | deep-equals the pre-turn graph (`expectUnchanged`) |

¹ `partial` remains a valid production outcome (spec §2.6) but **no scenario asserts it** — on a mixed-validity
ask the agent may refuse or partially apply, so the harness leaves that choice unpinned (see "Coverage" below).

`committed` is a JSON diff of the post-turn live graph against the pre-turn snapshot — the specialists edit
the live `CanvasBinding` directly, so a real edit shows up there.

## What a well-defined scenario is

- **A graph as small as the scenario needs.** Each scenario builds the _minimal_ graph that makes its
  behavior verifiable — one node for a move, two same-labelled nodes for an ambiguity check, the single
  generator for a config merge. The node list is seeded into the prompt every turn, so a small graph keeps
  the **live** token cost down and the intent obvious. The shared 4-node `fixtures.ts` graph is for scenarios
  that genuinely need a realistic canvas — the **integration** fan-out / align cases; deterministic per-agent
  suites may use either (they cost no tokens), but prefer minimal.
- **A precise oracle matched to the intent** — exact where the intent pins a value, relational where it does
  not. Never assert a magnitude the request never specified.
- **An explicit target.** Name the node under test; leave it vague **only** when ambiguity or an absent
  target _is_ the thing under test. An implicit target adds an inference step where a live model flip-flops
  (act vs. ask), causing flaky misses unrelated to the behavior.
- **A no-edit oracle** — `committed === false` **and** the post-turn graph deep-equals the scenario's own
  initial graph — for every `refused` / `answered` case (the integration suite's `expectUnchanged` helper is
  one instance of this, against the shared fixture).
- **Coverage spans the _tested_ outcomes — `applied`, `refused`, `answered`.** `applied` (every intended edit
  landed — including a compound add → wire → configure), `refused` (ambiguity / invalid value / missing field /
  an unroutable connection / permission or capability gap → **nothing lands**), and `answered` (a pure
  question, no edit).
    - **`partial` stays a production outcome (spec §2.6) but is not a test target.** On a mixed-validity ask
      (some parts valid, one bad), we do **not** pin the outcome: the agent may reasonably refuse the whole
      request _or_ partially apply the good parts and report the bad one — both are acceptable. So the harness
      ships **no scenario whose oracle asserts `partial`** (neither deterministic nor live), and the live
      outcome set is exactly `applied | refused | answered`.
    - **Deterministic `refused` cases are _fully_ refused — no mix.** Every deterministic refusal is a whole-turn
      no-op (`expectUnchanged`: `committed === false` and the graph deep-equals its own initial graph). We do not
      script a case where some parts apply and others refuse — that mixed shape is exactly the `partial` we leave
      to the agent's judgement.

---

Behavior & the loop: **[harness-spec.md](./harness-spec.md)**. Types & the eval entry:
**[harness-interfaces.md](./harness-interfaces.md)**.
