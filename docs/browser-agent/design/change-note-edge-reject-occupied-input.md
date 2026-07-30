# Change note — edge: reject an occupied input, don't replace

> The **transition** from "`connect_nodes` silently replaces the edge on an occupied target input" to
> "`connect_nodes` **rejects** an occupied input, names the occupying edge, and leaves the graph unchanged —
> the orchestrator disconnects, then reconnects." The clean end-state lives in the design docs
> ([edge.md](../agents/edge.md), [harness-spec.md](./harness-spec.md),
> [harness-interfaces.md](./harness-interfaces.md),
> [implementation-interfaces.md](./implementation-interfaces.md)). This page is the a→b how-to; delete it once
> the change has landed. Written 2026-07-30.

## Why

Silent replacement was the one place the edge specialist **worked around** an obstacle (an occupied input)
with a destructive, unreported edit — displacing a connection the orchestrator (and the user) never saw
removed. That contradicts the agent's own contract: _"a rejected connection is reported, not worked around;
someone else decides the fix; the specialist never guesses"_
([edgeAgent.ts](../../../libs/agent/src/agents/edgeAgent.ts)). An occupied input is now treated like every
other reason a connection can't be made: **reported, not resolved by guessing.** Multiple input ports make
this concrete — a node can carry several inputs, so the specialist must land on the intended one and surface a
clash rather than overwrite whatever happened to be there.

After this change the replace was also **dead** on the agent seam: `binding.addEdge`'s replace had no live
caller (the interactive drag replaces via its own `withReplacedInputEdge` in `WorkflowCanvas`, never through
the binding) and no coverage outside the tool test that is now a reject test. So the binding drops it and
becomes a plain append — closer to its stated _"applies what it is given, never judges"_ principle.

## The delta (a → b)

1. **`connect_nodes` rejects an occupied target input** —
   [`edgeTools.ts`](../../../libs/agent/src/tools/edgeTools.ts). After the port / type / cycle checks and
   before `binding.addEdge`, look for an existing edge on `(targetNodeId, targetPortId)`; if one exists,
   return `toolErr` naming its id and source (`<sourceNodeId>:<sourcePortId>`). Update `CONNECT_NODES_DEF`
   (drop "the existing edge is replaced" → "the connection is rejected and names the existing edge").

2. **`binding.addEdge` becomes append-only** —
   [`inMemoryCanvasBinding.ts`](../../../libs/agent/src/canvas/inMemoryCanvasBinding.ts) drops the
   filter-out-occupied step; the desktop ref
   [`WorkflowCanvas.tsx`](../../../apps/web/src/app/features/flows/components/WorkflowCanvas.tsx) `addEdge`
   handle appends (`[...prev, newConn]`) instead of calling `withReplacedInputEdge`. **The interactive drag
   handler keeps `withReplacedInputEdge`** — human drag-to-replace UX is unchanged.

3. **Persona** — [`edgeAgent.ts`](../../../libs/agent/src/agents/edgeAgent.ts): add "the target input is
   already occupied" to the reject-and-report reasons, and note the fix path (report the occupying edge; the
   orchestrator `disconnect_edge`s it, then reconnects).

4. **Tests** — [`edgeTools.spec.ts`](../../../libs/agent/src/__tests__/tools/edgeTools.spec.ts) +
   [`edge.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/edge.spec.ts):
    - the "replaces on occupied input" case becomes "**rejects** on occupied input, names the occupying edge,
      leaves it intact";
    - the incompatible-type case swaps the synthetic `number` input for a **real** cross-type pair
      (`text` → `image`): `number` is a valid `PortDataType` but no shipped block exposes a number input, so
      that block was fake; `text` and `image` are real shipped port types (`input-text` emits `text`,
      `single-image-generator` emits `image`);
    - a new **multi-input** block (two input ports) proves per-port independence: connecting to one port never
      disturbs an edge on a sibling port, and only the _same_ occupied port rejects.

## Not changed

- The interactive canvas's drag-to-replace UX (`withReplacedInputEdge` at the `handlePortMouseUp` call site) —
  a human dragging a new wire onto an occupied port still replaces, as expected.
- The `canModifyCanvas` capability gate and checkpoint-for-undo on every write.
- **Edges bind to ports by `portId`, never by index.** The order the agent adds edges never mattered and
  still doesn't: `isValidConnection`'s `sourceIdx`/`targetIdx` are already `@deprecated` and unused, and
  execution order is the server's readonly Kahn's-level (`NodeData.executionOrder`), derived from graph
  topology — not from edge insertion order. What matters is landing on the right `targetPortId`, which
  `describe_node` exposes for every input port.
