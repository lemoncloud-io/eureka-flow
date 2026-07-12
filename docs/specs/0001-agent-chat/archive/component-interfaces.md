# Agent Chat — Component Interfaces

> **Status:** The typed shape of every seam. Companion to **[`workflow-logic.md`](workflow-logic.md)** — **behavior there, shapes here.** This page is the **top-down overview + index**; the detailed typed shapes live in small files under **[`interfaces/`](interfaces/)**, linked below. Read this top to bottom, then click into a file when you want detail. `workflow-logic.md` wins on any behavior/shape disagreement; the other numbered files in this folder are stale.

For the big picture there are really only **five interfaces that matter**. Everything else in `interfaces/` is the detail *inside* those five. Read them in the order below — it follows the logic of a turn, not the alphabet.

---

## The big picture

**How the screen updates (the render loop):**

```
                 send(text) / resolvePending(decision)
   Agent Panel ─────────────────────────────────────►  Orchestrator
        ▲                                                    │ writes
        │ renders from                                       ▼
        └────────────────────────  Storage  ◄───────────────┘
                                 (the AgentSession)
```

The Panel sends **commands** up to the Orchestrator; the Orchestrator **writes** state (streaming text, status, gates) to Storage; the Panel **renders from** Storage. One-way loop — the Panel never reads the flow directly.

**What the Orchestrator drives during a turn:**

```
                          Orchestrator
                               │  (drives, during the turn)
          ┌────────────────────┼─────────────────────┐
          ▼                     ▼                      ▼
     LlmGateway            ToolExecutor           Environment
      (think)          (LLM acts, mid-loop)      (draft + commit)
                                                       │
                                                 CanvasBinding
                                                       │
                                                       ▼
                                          the real on-screen canvas
```

The Orchestrator is the hub of both pictures.

A turn is: the **Orchestrator** drives everything. It talks to three things — the **LLM** (via the Gateway) to *think*, the **Tool Executor** to let the LLM *act*, and the **Environment** to manage the *draft* and *commit* it. The Environment reaches the real canvas only through the **CanvasBinding**. That's the whole system; the rest is detail.

---

## The five interfaces that matter

### 1. Orchestrator — runs the turn · [detail →](interfaces/1-orchestrator.md)

The spine. It owns the turn, runs the think→act loop, and manages every approval gate. Everything else is a collaborator it calls. Its entire public surface:

```ts
interface Orchestrator {
  send(text: string): Promise<void>;       // user typed a message → run the entire turn
  resolvePending(r: GateResolution): void; // user clicked Accept/Reject (or Confirm/Decline)
  abort(): void;
}
```

### 2. The two ways the flow gets touched

This duality is the heart of the design.

- **ToolExecutor** — how the **LLM acts, mid-loop.** The model emits tool calls; one executor runs each. · [detail →](interfaces/2-tools.md)
  ```ts
  interface ToolExecutor {
    dispatch(call: ToolCall): Promise<ToolResult>; // validate → check permission → do it → result
  }
  ```
- **Environment** — the **turn-boundary machinery** the *Orchestrator* drives (the LLM never calls these): snapshot the live flow, fork a scratch copy, diff it, commit it. · [detail →](interfaces/3-environment.md) · commit internals: [diff/plan/promote →](interfaces/4-diff-plan-promote.md)
  ```ts
  interface Environment {
    snapshotBaseline(): Baseline;   // remember the live flow at turn start
    fork(): void;                   // make a scratch copy (on the first edit)
    diff(): FlowDiff;               // what changed = the plan you approve
    promote(plan): Promise<...>;    // commit the changes to the real flow
    discardDraft(): void;           // throw the scratch copy away
    // (+ resolvePermissions, checkDrift, switchToVersion — see detail)
  }
  ```
- **LlmGateway** — where thinking comes from; provider-neutral. · [detail →](interfaces/6-session-gateway.md)
  ```ts
  interface LlmGateway {
    createChatCompletion(req): AsyncIterable<Chunk>; // ask the model; stream the reply
  }
  ```

### 3. The one door to the real canvas · [detail →](interfaces/3-environment.md)

- **CanvasBinding** — the *only* thing that touches the live, on-screen flow (read it, write it, reload it). The Environment reaches the canvas exclusively through this seam.
- **RunTracker** — its sibling: turns a fire-and-forget run into an awaitable result. · [detail →](interfaces/5-runs.md)

### 4. Supporting cast (passive)

**Storage** saves the session · **Prompt Builder** assembles the LLM request · **Skill Registry** holds playbooks · **Agent Panel** is a pure view (no logic). · [detail →](interfaces/6-session-gateway.md)

---

## How one turn flows through them

1. Panel calls `orchestrator.send(text)`.
2. Orchestrator asks the **Environment** to snapshot the baseline, then loops: ask the **Gateway** to think → the model calls tools → the **Executor** runs each (edits land in the *draft*, not live).
3. Loop ends → Orchestrator asks the Environment for the **`diff`**, shows it as a plan, waits at a gate.
4. User accepts → Orchestrator calls **`promote`**, which writes through the **CanvasBinding** to the real canvas.

---

## Detail files (`interfaces/`)

Read in this order; each is small and self-contained.

| # | File | Contains |
|---|---|---|
| 1 | [1-orchestrator.md](interfaces/1-orchestrator.md) | `Orchestrator`, `TurnPhase`, `Gate` / `GateResolution`, and the pure helpers (`PromptBuilder`, `SkillRegistry`, Panel) |
| 2 | [2-tools.md](interfaces/2-tools.md) | Tool kinds & names, `ToolCall` / `ToolResult`, `ToolRegistry`, `ToolExecutor`, the kind-scoped surfaces, and read-result shapes (`FlowSnapshot`, `NodeSnapshot`, `BlockCatalogEntry`) |
| 3 | [3-environment.md](interfaces/3-environment.md) | `Environment` (+ how it's constructed), the headless `Draft`, `CanvasBinding`, `PersistOps` |
| 4 | [4-diff-plan-promote.md](interfaces/4-diff-plan-promote.md) | `FlowDiff`, `Plan` / `PlanOperation`, `Baseline` / `DriftStatus`, the commit order, the version-toggle revert |
| 5 | [5-runs.md](interfaces/5-runs.md) | `RunTracker`, `RunRequest` / `RunHandle` / `RunOutcome`, the affected-target precondition, `PendingRunIntent` |
| 6 | [6-session-gateway.md](interfaces/6-session-gateway.md) | `AgentSession` / `AgentMessage`, `StorageInterface`, `LlmGateway` |
| 0 | [0-conventions.md](interfaces/0-conventions.md) | **Reference:** branded ids, reused codebase types, interface-vs-class, and the grounding map (seam → real primitive) |

---

## Two conventions to know before you click in

1. **Interface = contract, not container.** A TS `interface` lists only the methods a *caller* uses; the object's fields (its collaborators) live on the **class** that implements it, as private constructor-injected fields. So "component X *owns* Y" means the class holds Y privately — you won't see it on the interface. (Full note + example in [0-conventions.md](interfaces/0-conventions.md).)
2. **Ids are branded** (`ServerNodeId` vs `TempNodeId`, etc.) so the compiler enforces "a run only targets a persisted node" and "a temp id is never sent to the server." (Detail in [0-conventions.md](interfaces/0-conventions.md).)
