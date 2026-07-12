# Agent Chat — In-Browser Flow Agent

A chat agent that lives in the Eureka Flow editor and **builds and edits flows for you in plain
language** — it can add, remove, reconfigure, **rename**, and **move** blocks. You describe what you
want; it reads your flow, works out the changes on a private copy, and shows you exactly what it will
do. Nothing changes on your canvas until you click **Accept** — and when you do, it simply **swaps**
the new version in.

> This is the friendly tour. For interfaces and precise behavior, see **[SPEC.md](SPEC.md)**.
> Scope of this first version: **generate + edit** flows on the frontend. Running flows and saving
> durably to the server come later (see *What's not here yet*).

---

## What it can do

- **Generate** — "build a flow that fetches an article and summarizes it."
- **Edit** — "add an email step after the summary," "rename this node to *Summarize*," "line these
  three nodes up," "remove the translate block."

## What's not here yet

- **Running flows** (execute / troubleshoot) — deferred to the next milestone.
- **Saving durably to the server** — this version applies changes on the **frontend** (a flow swap);
  wiring them through to permanent backend storage is the next step.
- **Multi-user co-editing** — v1 assumes you're the only editor of your flow.
- **Undo/redo of an agent change** — you Accept or Reject a whole plan (a back-and-forth toggle is
  easy to add later, since we keep a copy of your original flow).

---

## The big picture

You talk to the **Panel**. The **Orchestrator** runs the turn and is the only thing that writes state.
It leans on three helpers — the **LlmGateway** to think, the **ToolExecutor** to let the model act,
and the **Workspace** to hold the draft and swap it in. The Workspace reaches the real canvas through
one door: the **CanvasBinding**.

```mermaid
flowchart TD
    User([You]) -->|message| Panel[Agent Panel]
    Panel -->|send / resolvePlan| Orch[Orchestrator]
    Orch -->|writes state| Store[(Session store)]
    Store -->|renders| Panel
    Orch -->|think| LLM[LlmGateway]
    Orch -->|act| Tools[ToolExecutor]
    Orch -->|draft + swap| WS[Workspace]
    Tools -->|read / mutate| WS
    WS -->|read / swap| Bind[CanvasBinding]
    Bind -->|the real flow| Live[(Live canvas)]
```

Notice the little loop on the left: **Panel → Orchestrator → store → Panel**. Data flows one way. The
Panel only sends commands and renders what's in the store; it never touches the flow itself.

## The pieces (UML)

```mermaid
classDiagram
    class Orchestrator {
        <<the turn, sole writer>>
        +send(text) Promise
        +resolvePlan(decision)
        +abort()
    }
    class LlmGateway {
        <<thinking>>
        +chat(req) AsyncIterable
    }
    class ToolExecutor {
        <<the model acts>>
        +dispatch(call) ToolResult
    }
    class Workspace {
        <<draft + swap>>
        +snapshotBaseline()
        +getFlow() FlowSnapshot
        +diff() FlowDiff
        +promote()
        +discard()
    }
    class CanvasBinding {
        <<door to the live canvas>>
        +readGraph() Graph
        +swapFlow(graph)
    }
    Orchestrator --> LlmGateway
    Orchestrator --> ToolExecutor
    Orchestrator --> Workspace
    ToolExecutor --> Workspace
    Workspace --> CanvasBinding
```

## How a turn works

The agent thinks and acts in a loop: it asks the model, the model calls tools, the tools edit a
**draft** (never your live flow), and this repeats until the model is done. Then you get a plan — and
on Accept, the draft is swapped in.

```mermaid
sequenceDiagram
    actor User
    participant Panel as Agent Panel
    participant Orch as Orchestrator
    participant LLM as LlmGateway
    participant Tools as ToolExecutor
    participant WS as Workspace
    participant Canvas as CanvasBinding

    User->>Panel: "add a summarizer after the fetch"
    Panel->>Orch: send(text)
    Orch->>WS: snapshotBaseline()
    loop think and act
        Orch->>LLM: chat(history + tool defs)
        LLM-->>Orch: tool call (add_node, update_node, connect, ...)
        Orch->>Tools: dispatch(call)
        Tools->>WS: mutate (forks the draft on the first edit)
        WS-->>Tools: result (e.g. tempId)
        Tools-->>Orch: ok
    end
    LLM-->>Orch: final text
    Orch->>WS: diff()
    WS-->>Orch: FlowDiff
    Orch-->>Panel: show plan (awaiting your decision)
    User->>Panel: Accept
    Panel->>Orch: resolvePlan("accept")
    Orch->>WS: promote()
    WS->>Canvas: swapFlow(draft)
    Orch-->>Panel: done
```

## The turn's lifecycle

A turn moves through a few simple states. A pure question (no edits) skips straight to an answer; an
editing turn stops at `awaiting_plan` and waits for you. Because applying is a single swap, there's no
separate "committing" state.

```mermaid
stateDiagram-v2
    [*] --> idle
    idle --> thinking : send(text)
    thinking --> thinking : tool call (read or mutate draft)
    thinking --> awaiting_plan : loop ends, draft has changes
    thinking --> done : no changes (pure answer)
    awaiting_plan --> done : Accept (swap the draft in)
    awaiting_plan --> done : Reject (discard the draft)
    thinking --> error
    done --> [*]
    error --> [*]
```

## Draft → plan → swap (the safety story)

This is the heart of the design. Edits go to a **hidden draft copy** of your flow. At the end, the
difference between the draft and your original flow *is* the plan you review. Accept **swaps the draft
in** as your live flow; Reject throws the draft away.

```mermaid
flowchart TD
    A[Turn starts] --> B["Snapshot baseline (your live flow, right now)"]
    B --> C{"Agent calls a mutate tool?"}
    C -->|"first mutate"| D["Fork a hidden draft copy"]
    C -->|"never (pure question)"| Q[Read-only turn]
    D --> E["Edits land in the draft — your live flow is untouched"]
    E --> F[Reasoning loop ends]
    Q --> F
    F --> G{"Any changes? (is the diff empty?)"}
    G -->|"empty"| H[Just answer — no plan]
    G -->|"has changes"| I["Show plan = the diff + a plain-language explanation"]
    I --> J{Accept or Reject}
    J -->|Accept| K["Swap the draft into your live canvas (one step)"]
    J -->|Reject| L[Discard the draft]
    K --> M[Your live flow now shows the changes]
```

Why a draft? Because it makes "never touch the live flow by accident" free: the draft is a headless
copy of the canvas with no save wiring attached, so edits stay in the draft until you Accept — and
Accept applies the **exact** draft you reviewed, so what you saw is what you get. (Details in
[SPEC.md §8](SPEC.md#8-the-draft-model-why-its-safe).)

## A worked example

You're looking at a flow that fetches an article. You type:

> **"Summarize the article, rename the fetch node to *Get article*, and email the summary to me."**

1. The agent reads your flow and the block catalog (`get_flow`, `list_blocks`).
2. On a draft it renames the fetch node (`update_node` → label), adds a **Summarize** block wired
   after it, then an **Email** block after that (`add_node`, `connect`) — your canvas hasn't changed.
3. It shows a plan: *"Renamed 1 node, +2 nodes, +2 connections — summarizes the article text and
   emails the result to you,"* with the diff.
4. You click **Accept**. The draft is swapped into your canvas, and your flow now shows the renamed
   node and the two new blocks in place.

---

**Next:** the interfaces and exact behavior live in **[SPEC.md](SPEC.md)**. Earlier, more detailed
design iterations are archived under [`archive/`](archive/) for reference.
