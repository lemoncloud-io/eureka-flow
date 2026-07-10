# 1 · Orchestrator, phases & gates

> Part of the Agent Chat **[Component Interfaces](../component-interfaces.md)** · behavior in **[`workflow-logic.md`](../workflow-logic.md)**. Start here — this is the spine every other file hangs off.

The Orchestrator is the sole writer. It owns the turn, runs the reasoning loop, and manages every gate. It imports nothing from Flow or React — it reaches the flow world only through the [Tool Interface](2-tools.md) and the [Environment](3-environment.md).

---

## 1.1 Turn phase & gate

```ts
type TurnPhase =
  | { status: 'idle' }
  | { status: 'thinking' }
  | { status: 'awaiting_plan'; gate: Extract<Gate, { kind: 'plan' }> }
  | { status: 'awaiting_run';  gate: Extract<Gate, { kind: 'run'  }> }
  | { status: 'promoting' }         // committing; does NOT lock the owner's canvas in v1
  | { status: 'executing' }
  | { status: 'done' }
  | { status: 'error'; error: string };

type Gate =
  | { kind: 'plan'; plan: Plan }                          // Plan → 4-diff-plan-promote.md
  | { kind: 'run';  request: RunRequest; summary: string }; // RunRequest → 5-runs.md

type GateResolution =
  | { kind: 'plan'; decision: 'accept' | 'reject' }
  | { kind: 'run';  decision: 'confirm' | 'decline' };
```

There is exactly **one** pending gate at a time — the plan gate (finalize) and the run gate (in-loop) are time-disjoint within a turn, so they share the single slot embedded in an `awaiting_*` phase.

## 1.2 Orchestrator

```ts
interface Orchestrator {
  send(text: string): Promise<void>;                 // S2: append user msg → resolve permissions →
                                                      // snapshot baseline → run loop → finalize
  resolvePending(resolution: GateResolution): void;  // Panel → resume a gated turn
  abort(): void;
}
```

That is the entire public surface. The reasoning loop, gate management, promote, and build-and-run auto-continue all live *inside* `send` (their behavior is specified in `workflow-logic.md` §§ Lifecycle / Build-and-run) — they are not separate methods.

## 1.3 Supporting pure components

These have no state of their own; they are pure helpers the Orchestrator calls.

```ts
interface PromptBuilder {
  // pure: assembles the LLM request; structural snapshot only on the first iteration
  build(
    session: AgentSession,                                  // → 6-session-gateway.md
    ctx: { snapshot?: FlowSnapshot; skillIndex: SkillIndexEntry[] } // FlowSnapshot → 2-tools.md
  ): ChatCompletionRequest;                                 // → 6-session-gateway.md
}

interface SkillRegistry {
  index(): SkillIndexEntry[];        // shown in the prompt
  get(name: string): string | undefined; // playbook text for the use_skill meta-tool
}
interface SkillIndexEntry { name: string; description: string; }
```

The **Agent Panel** has no interface of its own: it emits `send` / `resolvePending` to the Orchestrator and renders purely from the persisted `AgentSession`.

---

Next: **[2 · Tools →](2-tools.md)** · Back to the **[overview](../component-interfaces.md)**
