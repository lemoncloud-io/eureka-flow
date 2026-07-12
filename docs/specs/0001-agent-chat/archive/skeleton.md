# Agent Chat — Skeleton (v0)

> **Status:** The simplest coherent version — the one loop, nothing else. **Start here.** The full,
> hardened design lives in [workflow-logic.md](workflow-logic.md) (behavior) and
> [component-interfaces.md](component-interfaces.md) (shapes); this skeleton is the subset we build
> **first**, and every deferred piece is an addition to it, not a rewrite.

**What it does:** the agent reads the flow you're looking at, edits a **draft** of it by chat, shows
you a **diff**, and — only when you click Accept — commits that diff to the real flow. That's the
whole loop.

**Scope:** generate + edit (goals 1–2). Running and troubleshooting flows (goals 3–4) come later,
with runs.

---

## What we keep, what we defer

| ✅ Keep (the skeleton) | ⏸️ Defer (hardening, added later) |
| --- | --- |
| **Orchestrator** — `send` + accept/reject | **Runs** — `run_*`, RunTracker, connection-id, build-and-run, pending-run-intent _(the biggest cut)_ |
| **LlmGateway** — one impl (+ a fake for tests) | **Drift hash** — v1 assumes a single editor; just re-read live at commit |
| **Read + mutate tools** | **Version-toggle revert** — commit forward only; toggling back is a nicety |
| **Draft** (forked store) — _the "never touch live" guarantee_ | **Branded ids** — plain strings; the guards they add are mostly run-related |
| **Diff → plan → gate** | **4 kind-scoped tool surfaces + generics** — one executor routing by name |
| **Promote** (awaited writes → reload) | **PromptBuilder / SkillRegistry / provider drivers** — inline / one impl |
| | **Self-echo suppression + flush-autosave** — promote hardening (a known skeleton gap) |

The simplifying **rules** we keep from the full design — these make it smaller, not bigger:

1. **No auto-approve.** Nothing persists without an explicit click.
2. **All-or-nothing plan.** Accept or reject the whole diff — no partial toggling.
3. **Draft-first mutations.** Edits land in a forked draft, never the live flow.
4. **The diff _is_ the operation set.** The agent never authors an op list — the plan's operations
   are the computed draft-vs-baseline diff, so "shown" and "applied" can't diverge.

---

## One turn

1. Panel → `orchestrator.send(text)`.
2. Orchestrator: `workspace.snapshotBaseline()`, then loops — `gateway.chat(…)` → the model calls
   tools → `executor.dispatch(…)`. Reads hit live-or-draft; the **first mutate** forks the draft and
   edits land there. **Live is never touched.**
3. Loop ends → `workspace.diff()` → shown as a `Plan` → `phase = 'awaiting_plan'` (the gate).
4. **accept** → `workspace.promote()` (awaited writes → `binding.reload()`); **reject** →
   `workspace.discard()`.

**Render loop:** Panel → `send` → Orchestrator writes state → store → Panel re-renders. The Panel is
a pure view; the Orchestrator is the only writer.

---

## The five interfaces

```ts
// Ids are plain strings in the skeleton. A draft-only node uses a "temp:" id; promote remaps
// temp → real. (Brand them later if we want the compile-time guard back.)

// 1 · Orchestrator — owns the turn; the only writer.
interface Orchestrator {
  send(text: string): Promise<void>;                 // message → think/act loop → plan gate
  resolvePlan(decision: 'accept' | 'reject'): void;  // user clicked the card
  abort(): void;
}

// 2 · LlmGateway — the only LLM dependency (one impl now; a fake impl for tests).
interface LlmGateway {
  chat(req: ChatRequest): AsyncIterable<Chunk>;      // stream the reply
}

// 3 · ToolExecutor — how the LLM acts. One entry point, routes by name.
interface ToolExecutor {
  dispatch(call: { id: string; name: ToolName; args: unknown }): Promise<ToolResult>;
}
type ToolName =
  | 'list_blocks' | 'get_flow'                                             // read   → live/draft
  | 'add_node' | 'update_node' | 'delete_node' | 'connect' | 'disconnect'; // mutate → draft only
type ToolResult = { ok: true; data?: unknown } | { ok: false; error: string };

// 4 · Workspace — the draft + the commit. The Orchestrator drives it; the LLM never sees it.
interface Workspace {
  snapshotBaseline(): void;   // remember the live flow at turn start
  getFlow(): FlowSnapshot;    // draft if it exists this turn, else live
  mutate: MutateOps;          // add/update/delete/connect/disconnect — DRAFT ONLY, never live
  diff(): FlowDiff;           // draft vs baseline = the plan
  promote(): Promise<void>;   // commit the diff to live (awaited writes), then reload
  discard(): void;            // reject / turn end
}

// 5 · CanvasBinding — the one door to the real, React-owned canvas.
interface CanvasBinding {
  readGraph(): Graph;         // live structural read
  persist: PersistOps;        // awaited server writes (see Commit, below)
  reload(): Promise<void>;    // re-fetch the flow into the live canvas after commit
}
```

The two "hands":

```ts
interface MutateOps {         // → the draft store's pure actions; nothing persists
  addNode(input: { type: string; config?: Record<string, string>; label?: string }): { tempId: string };
  updateNode(id: string, patch: { config?: Record<string, string>; label?: string }): void;
  deleteNode(id: string): void;
  connect(edge: Edge): { edgeId: string };
  disconnect(edgeId: string): void;
}

interface PersistOps {        // → the same server endpoints the human editor hits; every call is AWAITED
  createNode(tempId: string, body: NodeCreateBody): Promise<string>; // returns the real server id
  updateNode(id: string, patch: { config?: Record<string, string>; label?: string }): Promise<void>;
  upsertEdges(edges: Edge[]): Promise<void>;
  deleteEdges(edgeIds: string[]): Promise<void>;
  deleteNodes(ids: string[]): Promise<void>;
}
```

What the Panel renders from, and the review artifact:

```ts
interface SessionState {
  messages: Message[];
  phase: 'idle' | 'thinking' | 'awaiting_plan' | 'promoting' | 'done' | 'error';
  plan?: Plan;                // present while awaiting_plan
}

interface FlowDiff {
  addedNodes:    { tempId: string; type: string; config?: Record<string, string>; label?: string; position: XY }[];
  removedNodes:  string[];
  modifiedNodes: { id: string; config?: Record<string, string>; label?: string }[];
  addedEdges:    Edge[];
  removedEdges:  string[];
  isEmpty: boolean;
}
interface Plan { explanation: string; diff: FlowDiff; } // the agent writes the words; the diff IS the ops
```

_(Supporting shapes — `ChatRequest`, `Chunk`, `FlowSnapshot`, `Graph`, `Edge`, `XY`, `Message`,
`NodeCreateBody` — are the obvious ones; their full versions are in
[component-interfaces.md](component-interfaces.md).)_

---

## The draft (the safety guarantee)

The draft is a second, **headless** copy of the canvas store — `createCanvasStore()`, seeded from
the live flow with **identical ids**, mutated through the store's existing pure actions. Because no
persistence is attached to a headless instance, draft edits **cannot** reach the server — "never
touch live" comes for free, with no suppress-persistence flag. _(The one-line additive store refactor
that enables this is in [workflow-logic.md § The draft model](workflow-logic.md#the-draft-model).)_

- **Structural reads** (`get_flow`) hit the **draft if it exists this turn, else live** — so the agent
  sees its own in-progress edits.
- The draft is **forked lazily on the first mutate** and **discarded at turn end**.

---

## Commit (promote)

On Accept, walk the diff in dependency order —
**disconnect → delete_node → add_node → update_node → connect** — through the binding's **awaited**
server writes (the same endpoints the human editor hits), then `reload()` the live canvas so the real
ids appear.

**Awaited is the whole point:** the debounced / fire-and-forget UI wrappers resolve _before_ the write
actually lands, so the mandatory reload would refetch pre-edit state and silently revert the agent's
work. New-node positions ride in the create body (a default placement — the agent can't see the
canvas), so there's no separate reposition step.

---

## Known gaps (accepted for the skeleton)

- **No concurrent-editor safety** during the multi-second commit — it assumes you're the only editor
  (v1's assumption anyway).
- A **build longer than ~3 s** could reload a partial graph mid-commit.

Both are closed by the deferred drift-hash + self-echo hardening in the full design.

---

## What it grows into

Each deferred piece is a clean addition:

- **Runs** → add an `execute` tool kind backed by a RunTracker — [interfaces/5-runs.md](interfaces/5-runs.md).
- **Concurrent-editor safety** → add the drift hash + replay-spanning self-echo suppression —
  [workflow-logic.md § Concurrency & drift](workflow-logic.md#concurrency--drift-owner--agent).
- **Revert** → add the id-preserving version toggle —
  [interfaces/4-diff-plan-promote.md § 4.5](interfaces/4-diff-plan-promote.md#45-version-toggle-the-revert).
- **Type safety** → brand the ids — [interfaces/0-conventions.md § 0.1](interfaces/0-conventions.md#01-branded-ids).

---

Full behavior: **[workflow-logic.md](workflow-logic.md)** · Full shapes: **[component-interfaces.md](component-interfaces.md)** · Index: **[README.md](README.md)**
