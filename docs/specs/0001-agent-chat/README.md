# Agent Spec — In-Browser Chat Agent for Eureka Flow

> Status: **Draft** · Owner: TBD · Last updated: 2026-07-09
> Related: [CONTEXT.md](../../../CONTEXT.md), [ADR-0002 permission model](../../adr/0002-flow-permission-model.md)

This spec is anchored by three **authoritative** documents; the numbered files below are supporting
material being reconciled against them.

## Contents

**Authoritative design** — read these first; they are the source of truth:

- [workflow-logic.md](workflow-logic.md) — **how a turn works**: locked decisions, components, the
  draft model, the plan/promote lifecycle, run tracking, and drift. Single source of truth for turn
  control flow.
- [component-interfaces.md](component-interfaces.md) — the typed shape of every seam (branded ids,
  the `ToolResult`/`FlowDiff`/`Plan` unions, and the `Environment`/`CanvasBinding`/`RunTracker`
  contracts): a top-down overview that indexes the per-component detail files in
  [`interfaces/`](interfaces/). Consistent with workflow-logic.md.
- [workflow-logic-diagrams.md](workflow-logic-diagrams.md) — sequence & containment diagrams for the above.

**Supporting spec** — _being reconciled against the authoritative design above (may lag):_

1. [Requirements](01-requirements.md) — functional (FR) and non-functional (NFR) requirements.
2. [User stories](02-user-stories.md) — primary flows (US-1..US-7) and edge cases (EC-1..EC-10).
3. [Architecture & design](03-architecture.md) — high-level architecture and component responsibilities.
4. [Data models & interfaces](04-data-models.md) — client types, flow snapshot, tool catalog, and the `LlmGateway` contract.
5. [Data flow & lifecycle](05-data-flow.md) — the turn loop, mutation lifecycle (draft → plan → promote), and simulation mode.
6. [Testing strategies](06-testing.md) — unit, integration, gateway/simulation, socket, E2E, permission matrix, and the eval harness.
7. [Concerns](07-concerns.md) — naming, key-in-browser risks, cost/abuse, mutation safety, concurrency, prompt injection.
8. [Open questions](08-open-questions.md) — unresolved decisions.

---

## Overview

### Summary

[Eureka Flow](https://flow.eureka.codes/) has many simple blocks that can be composed into powerful
workflows. But users often can't exploit the full power of blocks, and building a flow by hand is
slow, repetitive, and error-prone. We want an **agent that lives in the browser** and helps users
work with Eureka Flow through natural-language chat.

The agent is a side panel in the flow editor. It reads the flow the user is currently looking at and
reasons over the block catalog. Its edits never touch the live flow directly: mutations run against a
**forked, headless draft** of the canvas store. When the turn ends, the accumulated changes are
surfaced as a **plan** (the draft-vs-baseline diff plus a natural-language explanation) that the user
reviews and **accepts or rejects** — nothing persists without an explicit click. On Accept, the plan
is **promoted** to the live flow through the same server mutations the human UI uses. **Runs** are the
exception: they execute against the live (persisted) flow and stream node status back in real time.

This document is a spec-driven-development artifact: it defines the feature precisely enough that any
engineer can implement it against the existing types, endpoints, and stores referenced below.

### Goals

A chat agent that can:

1. **Generate** a new flow from a natural-language description.
2. **Edit** an existing flow (add/remove/reconfigure/reconnect blocks).
3. **Troubleshoot** an existing flow (answer questions, explain why a node failed, suggest fixes).
4. **Execute** an existing flow (run one node, a subgraph, or the whole flow) and report results.

### Non-goals (v1)

- **A new backend built for this feature.** Stage 1 is 100% React/TypeScript in the browser; it
  reuses the existing Eureka run/credit APIs and reaches the LLM through the `LlmGateway` interface.
  A backend-proxy gateway is a deliberate **Stage 2**, not v1.
- **Multi-user / co-Editor simultaneous editing** on one flow. v1's concurrency scope is owner + own
  agent (EC-5); no locking/CRDT.
- Autonomous, unattended runs (no chat window open). v1 is human-in-the-loop only.
- Agent-authored **new block types** or code. The agent composes existing blocks; it does not write
  block implementations.
- Multi-flow / cross-workspace orchestration. The agent operates on **one flow at a time** — the
  flow currently open in the editor.
- Replacing the existing `agent-codex` **block** (a block that runs inside a flow). This feature is a
  meta-agent that _builds and operates_ flows; it reuses `agent-codex`'s trace infrastructure but is
  a distinct surface. See [Concerns → Naming](07-concerns.md#concerns).

### Grounding: what already exists

The design leans on infrastructure already in the repo — we add an orchestration layer, not a new
stack.

| Capability                                    | Already in repo                                                              | Reference                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Live canvas state (nodes, connections)        | `useCanvasStore`                                                             | `libs/flows/src/stores/useCanvasStore.ts`                            |
| Flow metadata + block registry                | `useFlowsStore`, `blockRegistry`                                             | `libs/flows/src/stores/useFlowsStore.ts`                             |
| Block catalog w/ inputs/outputs/config schema | `listBlocks()` → `BlockDefinitionWithFrontend[]`                             | `libs/flows/src/api/blocks.ts`                                       |
| Create / load / save / batch-upsert a flow    | `createFlow`, `loadFlow`, `saveFlow`, `upsertFlow`                           | `libs/flows/src/api/flows.ts`                                        |
| Add/config/delete a node w/ server sync       | `upsertNode`, `useNodeSync` (debounced)                                      | `libs/flows/src/api/nodes.ts`, `libs/flows/src/hooks/useNodeSync.ts` |
| Execute a node / subgraph                     | `runNode`, `runFlow`                                                         | `libs/flows/src/api/nodes.ts`, `flows.ts`                            |
| Read a node's error/state/IO                  | `getNode`, `getPortData`, `NodeData.status/error/outputData`                 | `libs/flows/src/api/nodes.ts`                                        |
| **Streaming agent traces over WebSocket**     | `CodexTraceStage`, `TraceEntry`, `RunContext`, `nodeRuns`                    | `libs/flows/src/types/index.ts`, `useCanvasStore.ts`                 |
| Real-time flow/node/port refresh              | `useInitFlowSocket` on the flow `channelId`                                  | `libs/socket`, `libs/flows/src/hooks/*Socket*`                       |
| Roles & permission flags                      | `FlowPermissions` (`canModifyCanvas`, `canEditConfig`, `canRun`, …)          | `libs/flows/src/types/permissions.ts`                                |
| Credits / BYO-key run modes                   | server-authoritative; `ProfileResponse.useApiKey`; `runNode({setting:true})` | CONTEXT.md, `libs/flows/src/api/profile.ts`                          |

---

Next: [Requirements →](01-requirements.md)
