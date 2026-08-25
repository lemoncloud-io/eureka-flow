# Flow JSON keeps node and edge ids, so an exported file can be imported back

The File menu can write the canvas out as JSON and read it back. Those two halves only
line up if the file carries ids, because an edge does not describe its endpoints — it
names them:

```jsonc
{
    "nodes": [{ "id": "n1a2b3…", "type": "text-input", "position": { "x": 10, "y": 20 } }],
    "edges": [
        {
            "id": "e9f8…",
            "sourceNodeId": "n1a2b3…",
            "targetNodeId": "n4c5d…",
            "sourcePortId": "out",
            "targetPortId": "in",
        },
    ],
}
```

Strip `id` from the nodes and every edge in the file points at something that no longer
exists. The file still looks plausible — same shape, same node count — and the failure only
shows up when someone tries to load it.

That is what the code did between `8b5f786` (2026-04-14) and `3b83668` (2026-08-11). That
first commit removed Import from the header and, in the same change, made Export strip the
ids of both nodes and edges. With no importer left in the product, nothing exercised the
round trip, and the export quietly became write-only. Restoring Import meant the strip had
to go first; otherwise the feature would have shipped unable to read its own output.

## The contract

`libs/engine/src/persistence/flowJson.ts` owns both directions and is the only place that
should. The dev graph panel and the File menu now call the same pair, which is why the round
trip can be tested once rather than per caller.

- **`serializeFlowJson(graph)`** writes `{ nodes, edges }` verbatim, ids included. Ids are
  minted on the client and are meaningful — they are what the edges, and a later save,
  refer to.
- **`parseFlowJson(text)`** returns a discriminated result rather than throwing, and refuses
  four shapes the canvas cannot load: text that is not JSON, a JSON value that is not an
  object, a payload with no `nodes` array, and a node whose `id` is not a string. `edges` is
  optional — a flow may legitimately have none — but if present it must be an array.
- The error strings are user-facing. `FlowEditorPage` puts them in a toast next to the file
  name, so a rejected file says which file and why.

Two behaviours around the edges of that contract are deliberate:

- **Import does not touch the baseline.** The imported graph reads as unsaved work, and the
  user decides whether it replaces what the server holds. Import also asks for confirmation
  first when the current graph differs from the baseline, because it replaces the whole
  graph rather than merging into it.
- **Validation stops at the shape.** `parseFlowJson` does not check that an edge's
  `sourceNodeId` exists among the nodes, nor that a node's `type` is a block the registry
  knows. A file that passes validation can still load into a canvas with a dangling edge.

## Considered Options

**Keep the strip and have import re-mint ids.** Rejected. Once the ids are gone from the
file there is nothing left to say which node an edge belonged to, so import would have to
invent a rule — match by array position, by type, by label — and every such rule is wrong
for some graph. The information has to survive the export; it cannot be reconstructed after.

**Export a different, id-free interchange format.** Rejected as more than the problem needs.
The graph the canvas holds and the graph the file holds are the same graph; a second format
would need its own mapping in both directions and its own tests, and would still have to
name edge endpoints somehow.

## Consequences

- **Files exported between 2026-04-14 and 2026-08-11 cannot be imported.** They have no
  node ids, so they fail validation with `Every node needs a string "id".` There is no
  migration path for them, for the reason given above.
- Exported files now contain client-minted ids. Importing the same file twice into two
  different flows produces two graphs whose nodes share ids; nothing today depends on those
  ids being globally unique, but a future feature that assumes it would be wrong.
- The round trip is covered by `apps/web/src/__tests__/flowJson.spec.ts`, including the case
  that failed before: parse what the File menu export writes and assert the first edge's
  `sourceNodeId` still names a node in the file.
