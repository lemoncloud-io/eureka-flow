# Agent Chat — Workflow Logic Diagrams

> Visual companion to **[`workflow-logic.md`](workflow-logic.md)**. These diagrams convey the whole design at a high level _without_ reading the prose spec. Each cites the section it renders.
>
> Diagrams are **UML** rendered with [Mermaid](https://mermaid.js.org) (component, sequence, state-machine, and activity types). They render inline on GitHub and in VS Code's built-in Markdown preview.
>
> **Reading order** follows one turn's life: `Overview → Draft vs. Live → Turn → Tool dispatch → Plan lifecycle → Promote → Run lifecycle`, with `Drift`, `Build-and-run`, and `Gate` as cross-cutting concerns.

---

## Legend

| Notation                          | Meaning                                                        |
| --------------------------------- | -------------------------------------------------------------- |
| solid arrow                       | direct call / command                                          |
| dashed arrow                      | reactive render / async result / return                        |
| **green** node                    | **Draft** — headless, in-memory, **never persists**            |
| **red** node                      | **Live** — the real, persisted flow (the only thing that runs) |
| **yellow** node (flowcharts only) | **Gate** — a hard stop waiting for an explicit user click      |

Two worlds run through every diagram: **Draft** (where the agent edits safely) and **Live** (the persisted flow that actually runs). The one rule of the whole design — _nothing reaches Live without an explicit user click_ — is why every write path funnels through a yellow **Gate**.

> **Note on yellow in sequence diagrams (§7, §8, §9, §11):** Mermaid renders _every_ sequence-diagram `Note` box in a default yellow. Those are **annotations / side commentary**, not Gates — the "yellow = Gate" convention above applies **only to the flowcharts**. In particular, the commit path (§7) contains yellow note boxes but has **no gate** (the gate already happened at Accept, before promote begins).

---

## 1. Overview — component architecture

The whole agent — reasoning loop, tools, orchestration — is React/TypeScript **in the browser**; no new backend. Four bands: the **agent core** (`libs/agent`, no React/Flow imports), the pluggable **`LlmGateway`** (one impl bound at runtime), the existing **flow layer** (`@flows`, React-owned), and **outside-the-browser** dependencies. The Orchestrator is the **sole writer**; it reaches the live canvas only through the **`CanvasBinding`** seam, and the LLM only through the gateway — so it never knows whether OpenAI, Gemini, or a simulation answered. _(§ Components, § Locked decision 8; mirrors [`03-architecture.md`](03-architecture.md))_

```mermaid
graph LR
    subgraph CORE["Agent core · libs/agent (browser, no React/Flow imports)"]
        UI["Agent Panel"]
        ORCH["Orchestrator<br/>sole writer · provider-agnostic loop"]
        PB["Prompt Builder"]
        STORE["Storage · AgentSession<br/>messages · traces · gate"]
        REG["Tool Registry"]
        EXEC["Tool Executor<br/>validate · permission · route by kind"]
        ENV["Environment<br/>baseline · fork · diff · promote"]
        RT["RunTracker"]
        DRAFT[["Draft store<br/>headless · never persists"]]
        UI --> ORCH
        ORCH --> PB
        ORCH -->|dispatch| EXEC
        ORCH -->|env ops at turn boundaries| ENV
        ORCH --> STORE
        STORE -.->|reactive render| UI
        EXEC --> REG
        EXEC -->|mutate · read if forked| DRAFT
        EXEC -->|run| RT
        ENV -->|fork · diff · discard| DRAFT
    end

    subgraph GATEWAY["LlmGateway · one impl bound at runtime (browser)"]
        GW["LlmGateway<br/>interface"]
        S1["BrowserLlmGateway<br/>Stage 1 · key in localStorage"]
        S2["ProxyLlmGateway<br/>Stage 2"]
        SIM["SimulationGateway<br/>scripted · no LLM"]
        OAI["OpenAiDriver"]
        GEM["GeminiDriver"]
        GW -.-> S1
        GW -.-> S2
        GW -.-> SIM
        S1 --> OAI
        S1 --> GEM
    end

    subgraph FLOWLAYER["Existing flow layer · @flows (browser, React-owned)"]
        CB["CanvasBinding<br/>live read · persist · reload · connId"]
        CANVAS["useCanvasStore / live canvas"]
        FLOWS["useFlowsStore<br/>blockRegistry"]
        FAPI["@flows/flows API<br/>upsertFlow · upsertNode · runNode"]
        SOCK["useInitFlowSocket"]
        CB --> CANVAS
        CB --> FAPI
    end

    subgraph OUTSIDE["Outside the browser · existing / third-party"]
        OAIAPI["OpenAI API"]
        GEMAPI["Gemini API"]
        PRX["Stage 2 proxy"]
        EUREKA["Eureka Flow API<br/>existing backend"]
    end

    ORCH <-->|request / reply| GW
    EXEC -->|live read| CB
    EXEC -->|catalog| FLOWS
    ENV -->|baseline · promote · reload · flush| CB
    RT -->|connId · outputs| CB
    RT -->|dispatch · run state| FAPI
    OAI --> OAIAPI
    GEM --> GEMAPI
    S2 --> PRX
    FAPI --> EUREKA
    EUREKA -->|WS events| SOCK
    SOCK --> CANVAS
    SOCK -.->|run events| RT

    classDef draft fill:#d5f5e3,stroke:#27ae60,color:#145a32;
    classDef live fill:#fadbd8,stroke:#c0392b,color:#641e16;
    classDef core fill:#d6eaf8,stroke:#2874a6,color:#1b4f72;
    class DRAFT draft;
    class CB,CANVAS live;
    class ORCH core;
```

_Dotted edges into the gateway = alternatives: exactly **one** `LlmGateway` impl is bound at runtime (Stage 1 now, Stage 2 later, Simulation in tests). Provider drivers live only inside `BrowserLlmGateway`; in Stage 2 that normalization moves into the proxy._

**Takeaways:**

1. **One outbound LLM seam.** The Orchestrator codes against `LlmGateway` only; provider drivers and key/transport staging sit behind it, so swapping Stage 1 → Stage 2 leaves the core untouched.
2. **The Executor reaches Live two ways:** `CanvasBinding` for live structural reads, `RunTracker → @flows API` for runs. The Environment reaches Live only through `CanvasBinding` (baseline, promote, reload, flush).
3. **Draft (green) and Live (red) are different objects;** only **promote** copies Draft changes into Live. Structural changes appear on the live canvas at promote — only _runs_ stream live (backend `WS events → socket → store / RunTracker`).

---

## 2. The two worlds — draft vs. live

The same tool surface is used all turn; only _where_ an edit lands changes. Structural reads follow the draft **once it is forked**, and fall back to **Live before that**. Runtime reads and runs always hit **Live**. _(§ The draft model, § Read targeting)_

```mermaid
flowchart TB
    Agent["Agent tool surface<br/>same tools all turn"]

    subgraph DraftWorld["DRAFT — during the turn"]
        DStore[["Draft store<br/>pure reducers<br/>cannot persist"]]
    end

    subgraph LiveWorld["LIVE — persisted"]
        LCanvas["Live canvas"]
        RunEng["Run engine"]
        Backend[("Backend")]
    end

    Agent -->|"mutate"| DStore
    Agent -->|"structural read · draft forked"| DStore
    Agent -->|"structural read · not forked yet"| LCanvas
    Agent -->|"runtime read · port data · node runs"| LCanvas
    Agent -->|"run"| RunEng

    DStore ==>|"promote · on Accept only"| Backend
    LCanvas --- Backend
    RunEng --- Backend

    classDef draft fill:#d5f5e3,stroke:#27ae60,color:#145a32;
    classDef live fill:#fadbd8,stroke:#c0392b,color:#641e16;
    class DStore draft;
    class LCanvas,RunEng,Backend live;
```

|                         | Where edits go                              | Persists? |
| ----------------------- | ------------------------------------------- | --------- |
| During the turn         | headless **Draft** store                    | **No**    |
| On **Accept** (promote) | **Live** canvas via `CanvasBinding.persist` | **Yes**   |

---

## 3. Lifecycle scopes — containment (not sequence)

Each deeper scope pulls in more components and runs **inside** the outer one. S6 nests inside the loop; S5 runs after the loop but still inside the Turn. _(§ Lifecycle)_

```mermaid
flowchart TB
    subgraph S1["S1 Session — Orchestrator + Storage"]
        subgraph S2["S2 Turn — add Panel"]
            subgraph S3["S3 Reasoning loop — add Prompt Builder, Gateway, Skills"]
                subgraph S4["S4 Tool dispatch — add Tool Interface, Draft"]
                    S6["S6 Run lifecycle<br/>add Flow, RunTracker<br/>only for run tools"]
                end
            end
            S5["S5 Plan lifecycle<br/>add Environment, CanvasBinding, Live<br/>runs after the loop, over the draft"]
        end
    end

    classDef scope fill:#eaeded,stroke:#566573,color:#1b2631;
    class S1,S2,S3,S4,S6,S5 scope;
```

---

## 4. Turn control flow (S2)

The spine: everything between one `send` and the final answer. _(§ S2 Turn, § S3 Reasoning loop)_

```mermaid
flowchart TD
    Start(["Panel · send text"]) --> A["append user message<br/>status = thinking"]
    A --> B["resolvePermissions<br/>snapshotBaseline<br/>capture graph + hash"]
    B --> C["Reasoning loop"]

    C --> D["Prompt Builder<br/>builds request"]
    D --> E["Gateway streams<br/>deltas to Storage"]
    E --> F{"model output"}
    F -->|"tool calls"| G["dispatch tools · S4"]
    G --> H{"first mutate"}
    H -->|"yes"| I["Environment fork<br/>draft born"]
    H -->|"no"| J["feed results back"]
    I --> J
    J --> C
    F -->|"final text"| K{"draft exists"}
    K -->|"no"| Z["emit answer<br/>discard draft"]
    K -->|"yes"| L["Plan lifecycle · S5"]
    L --> Z
    Z --> End(["turn ends"])

    classDef draft fill:#d5f5e3,stroke:#27ae60,color:#145a32;
    class I draft;
```

> The per-turn **iteration cap** bounds the loop and persists across in-turn re-entry (see [Build-and-run](#10-build-and-run-in-one-prompt)).

---

## 5. Tool dispatch (S4) — routing by kind

The Executor is the per-call choke-point: validate, permission-check, then route to exactly one surface. _(§ S4 Tool dispatch, § Read targeting)_

```mermaid
flowchart TD
    Call(["tool call"]) --> V["validate args"]
    V --> P{"permission ok"}
    P -->|"no"| Err["ToolResult<br/>error permission"]
    P -->|"yes"| K{"tool kind"}

    K -->|"read catalog"| R1["list_blocks to Registry"]
    K -->|"read structural"| R2{"draft forked"}
    R2 -->|"yes"| R2a["read Draft"]
    R2 -->|"no"| R2b["read Live"]
    K -->|"read runtime"| R3["port data · node runs<br/>read Live"]
    K -->|"mutate"| M["apply store action<br/>write Draft"]
    K -->|"meta"| Sk["use_skill<br/>playbook text"]
    K -->|"execute"| X["Run lifecycle · S6"]

    classDef draft fill:#d5f5e3,stroke:#27ae60,color:#145a32;
    classDef live fill:#fadbd8,stroke:#c0392b,color:#641e16;
    class R2a,M draft;
    class R2b,R3 live;
```

**Run precondition — a run may only dispatch against targets the un-promoted draft has not affected:** _(§ Runs require unaffected targets)_

```mermaid
flowchart TD
    RunReq(["run requested"]) --> T{"which tool"}
    T -->|"run_flow"| DF{"diff empty"}
    T -->|"run_node n"| DN{"n added or modified"}
    DF -->|"yes"| OK["dispatchable · go S6"]
    DF -->|"no"| BLK
    DN -->|"no"| OK
    DN -->|"yes"| BLK["blocked · not_persisted<br/>record pendingRunIntent"]

    classDef ok fill:#d5f5e3,stroke:#27ae60,color:#145a32;
    classDef blk fill:#fadbd8,stroke:#c0392b,color:#641e16;
    class OK ok;
    class BLK blk;
```

> A `run_node` on a node the draft **did not** touch fires immediately — mid-build troubleshooting is never over-blocked.

---

## 6. Plan lifecycle (S5) — draft to live

The accumulated draft becomes a reviewable plan and, on Accept, becomes live. The key insight: **the diff _is_ the operation set**, so "presented" and "applied" can never drift. _(§ S5 Plan lifecycle)_

```mermaid
stateDiagram-v2
    [*] --> CheckDraft
    CheckDraft --> FinalAnswer: no draft
    CheckDraft --> Diff: draft exists

    Diff: Diff — draft vs. baseline
    Diff: semantic only (id, type, config, label, edges)
    Diff: excludes position and runtime state
    Diff --> LowerOps

    LowerOps: lower to ordered operations
    LowerOps: deterministic, no reconcile
    LowerOps --> Explain

    Explain: agent writes explanation
    Explain: fallback is a mechanical summary
    Explain --> DriftCheck1

    DriftCheck1: checkDrift — live hash vs baseline
    DriftCheck1 --> Replan: drifted
    DriftCheck1 --> Present: clean

    Replan: notify, re-snapshot, replan
    Replan --> [*]

    Present: present plan card
    Present --> Gate

    Gate: PLAN GATE — Accept or Reject
    Gate --> Reject: Reject
    Gate --> DriftCheck2: Accept

    Reject: discardDraft, live untouched
    Reject --> FinalAnswer

    DriftCheck2: re-check drift before replay
    DriftCheck2 --> Replan: drifted
    DriftCheck2 --> Promote: clean

    Promote: promote — commit ops, then reload
    Promote --> FinalAnswer

    FinalAnswer: emit answer, discard draft
    FinalAnswer --> [*]
```

**What is (and isn't) in the diff:** _(§ S5.2)_

| Included — semantic, reviewable         | Excluded                                               |
| --------------------------------------- | ------------------------------------------------------ |
| node `{ id, type, config, label }`      | position (rides on the `add` op)                       |
| edge `{ src node/port, tgt node/port }` | run state, `inputData`/`outputData`, timestamps, `seq` |

---

## 7. Commit path (promote)

The only place draft structure becomes live. Ops replay **one at a time** through **awaited** human persistence primitives (via `CanvasBinding.persist`), teardown before build-up, so each server id is known before it is referenced and every write lands before the reload. _(§ The commit path)_

```mermaid
sequenceDiagram
    autonumber
    participant O as Orchestrator
    participant E as Environment
    participant CB as CanvasBinding
    participant BE as Backend

    O->>E: promote(plan)
    Note over E,CB: flush owner autosave first<br/>so the reload keeps un-hashed edits
    E->>CB: flushAutosave
    CB->>BE: await
    Note over E: raise self-echo suppression<br/>for the whole replay and reload

    rect rgb(250, 219, 216)
    Note over E,BE: ordered replay, one op at a time
    E->>CB: 1 delete removed edges
    CB->>BE: await upsertFlow
    E->>CB: 2 delete removed nodes
    CB->>BE: await upsertFlow
    E->>CB: 3 create nodes (position in body)
    CB->>BE: await createNode plus waitForNodeId
    BE-->>E: server id, recorded in idMap
    E->>CB: 4 update config and label
    CB->>BE: await upsertNode
    E->>CB: 5 add edges (endpoints via idMap)
    CB->>BE: await upsertFlow
    end

    Note over E,BE: any write rejects, abort and replan<br/>no partial-commit continue

    E->>CB: reload, load flow into live canvas
    Note over E: drop suppression after reload
    E-->>O: promoted, nodes now have real ids
```

> **Revert is an id-preserving version toggle, not native undo.** Keep the pre- and post-promote snapshots; to switch, `diff(current, target)` and commit it — tombstone nodes only in `current`, **re-add nodes only in `target` by their original id** (the backend resurrects tombstones), update shared nodes in place. Ids stay stable, so edges re-key and run history / port refs survive. _(§ Commit path → revert)_

---

## 8. Run lifecycle (S6) and RunTracker

Runs hit the **live** flow, so they are gated — but **once per turn**, not per call. Dispatch is fire-and-forget at the API level; **RunTracker** turns the socket completion into an awaitable so one tool call returns a finished result. _(§ S6 Run lifecycle, § Run tracking)_

```mermaid
sequenceDiagram
    autonumber
    participant O as Orchestrator
    participant RT as RunTracker
    participant CB as CanvasBinding
    participant FL as Flow and Live store
    participant WS as Socket

    Note over O: first dispatchable run this turn
    O->>O: write RUN GATE (Confirm or Decline)
    O-->>O: user Confirms
    Note over O: later runs this turn skip the gate

    O->>RT: run(target, connId from CB)
    RT->>FL: snapshot existing runIds
    RT->>FL: dispatch run, fire and forget
    RT->>FL: subscribe, then read nodeRuns once
    Note over RT: the sync read catches a fast run<br/>that finished before subscribe attached
    WS-->>FL: run events, new runId appears
    FL->>FL: finalizeRun normalizes into the store
    FL-->>RT: terminal COMPLETED or ERROR, or 60s timeout
    RT->>CB: read output ports for this run
    CB-->>RT: outputs
    RT-->>O: result — nodeId, state, outputs
    O->>O: feed into next loop iteration
```

> **`run_flow` splits dispatch from wait:** the **dispatch set** is the input-stereotype nodes (the same derivation the human _Run All_ button uses); the **wait set** is the nodes that actually enter `RUNNING` (bounded by 60 s). Waiting on the dispatch set alone resolves too early; waiting on all nodes stalls on untaken branches.
>
> The socket **connection id** must come through `CanvasBinding.getConnectionId()` (a live getter) — it is React state that changes on reconnect and lives in no store. Without this bridge, every run times out at 60 s.

---

## 9. Concurrency and drift (owner + agent)

v1 supports only the owner + their own agent. The draft forks once, so live edits during a turn never corrupt the in-flight draft — the risk is only at **promote**. Drift is a change to the **semantic content hash** (position excluded, so a cosmetic drag never marks a plan stale). _(§ Concurrency & drift)_

```mermaid
stateDiagram-v2
    [*] --> Baseline
    Baseline: baselineHash at snapshotBaseline (S2)
    Baseline --> Building: agent mutates draft
    Building --> GateCheck: loop ends, plan ready

    GateCheck: checkDrift at the plan gate
    GateCheck --> Stale: hash changed
    GateCheck --> Presented: hash matches

    Presented --> PreReplay: user Accepts
    PreReplay: re-check drift before replay
    PreReplay --> Stale: hash changed
    PreReplay --> Replaying: clean

    Stale: do not promote, notify, replan
    Stale --> Building

    Replaying: ordered commit, server round-trips
    Replaying --> Done: all ops land, then reload
    Replaying --> Aborted: owner edit invalidates an op

    Aborted: abort, next turn reconciles
    Done --> [*]
    Aborted --> [*]
```

**Two free safety nets cover the dangerous cases:** the **pre-replay drift re-check** catches anything the owner changed between Accept and promote, and **abort-on-rejection** catches a mid-replay edit that invalidates an op (e.g. deleting a node a `connect` references). The residual case — a mid-replay owner edit that invalidates _no_ op (an add, or an edit to an untouched node) — would be silently dropped by the authoritative reload. Closing it needs a transient owner-lock (new UI machinery), so v1 defers it under the single-editor assumption.

---

## 10. Build-and-run in one prompt

"Build these steps and run my flow" in a single prompt. The trigger is **explicit, not inferred**: it fires only because a run was _blocked_ by the un-promoted draft and recorded as a `pendingRunIntent`. _(§ Build-and-run in one prompt)_

```mermaid
flowchart TD
    A["agent builds in draft"] --> B["run hits a draft-changed target<br/>not_persisted"]
    B --> C["record pendingRunIntent<br/>persisted with the Plan"]
    C --> D{"PLAN GATE"}
    D -->|"Reject"| R["surface intent as a note<br/>never dropped"]
    D -->|"Accept"| E["promote · persist + idMap"]
    E --> F{"pendingRunIntent<br/>non-empty"}
    F -->|"no"| Z["turn ends"]
    F -->|"yes"| G["auto-continue · re-snapshot<br/>remap temp to real via idMap<br/>dispatch over live"]
    G --> H{"RUN GATE<br/>still asks, counter kept"}
    H --> I["further runs skip gate<br/>final message"]

    classDef gate fill:#fcf3cf,stroke:#b7950b,color:#7d6608;
    class D,H gate;
```

> `pendingRunIntent` is **persisted alongside the Plan** so a reload during the plan gate does not silently drop the "…and run it" half.

---

## 11. Gate — the shared suspend/resume primitive

Both the plan gate (Accept/Reject) and the run gate (Confirm/Decline) are the _same_ mechanism. There is one `pending` slot; the two gates are time-disjoint within a turn, so they never collide. _(§ Gate, § UI-sync)_

```mermaid
sequenceDiagram
    autonumber
    participant Orch as Orchestrator
    participant St as Storage
    participant P as Agent Panel
    participant U as User

    Orch->>St: write pending, plan or run
    St-->>P: reactive render, decision card
    Note over Orch: turn is suspended
    U->>P: click a decision
    P->>Orch: resolvePending
    Orch->>St: clear pending, apply resolution
    Orch->>Orch: resume turn
```

---

## The one rule — no persistent auto-approve

_(§ Locked decision 1)_

```mermaid
flowchart LR
    Plans["PLANS<br/>gated every time<br/>each plan needs Accept<br/>all-or-nothing"]
    Runs["RUNS<br/>gated once per turn<br/>first dispatchable run asks<br/>later runs proceed<br/>resets next turn"]
    Note["not a cross-turn toggle<br/>nothing reaches live<br/>without an explicit click"]

    classDef gate fill:#fcf3cf,stroke:#b7950b,color:#7d6608;
    class Plans,Runs gate;
```
