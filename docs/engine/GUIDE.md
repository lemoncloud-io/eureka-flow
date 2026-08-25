# Where the graph lives

A one-page map. · 한국어: [GUIDE.ko.md](GUIDE.ko.md)

> Both versions say the same thing. When you change one, **change both** — otherwise the other
> quietly becomes false. The published npm README links to this English one.

> **First**: nothing moved on disk. Same server endpoints, same localStorage keys, same
> IndexedDB. What changed is **who owns the graph in memory** and **who normalizes the load
> response**.

---

## Layers

| Layer               | What                                                                      | Where                                                                                          | Survives          |
| ------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------- |
| **engine document** | **Source of truth.** Editing, undo/redo and clipboard happen only here    | `libs/engine/src/core/document.ts` (`createFlowEngine`)                                        | nothing — memory  |
| `useCanvasStore`    | **One-way projection.** Dozens of components read from it                 | `libs/flows/src/stores/useCanvasStore.ts`                                                      | nothing — memory  |
| `baseline`          | The graph the server **last confirmed**. What "dirty" is measured against | `useFlowsStore.baseline` (`FlowSnapshot`)                                                      | nothing — memory  |
| draft               | Unsaved work                                                              | **IndexedDB** `eureka-flow` / `drafts` / key `'current'`                                       | reload, tab close |
| session bits        | Which flowId was open, autosave on/off, per-flow viewport                 | **localStorage** (`flows-current-flow-id`, `flows-auto-save-enabled`, `eureka-flow:viewports`) | reload            |
| server              | The record                                                                | `POST /flows/:id/save` · `GET /flows/:id/load`                                                 | everything        |

### One rule

> **Write to the engine, read from the store.**

`useEngineMirror` (`apps/web/.../hooks/useEngineMirror.ts`) pushes `engine.subscribe` →
`useCanvasStore.setState`, one direction only. No code reads the store and writes it back to the
engine — which is why the two can never argue about which one is right.

The mirror **pauses** during a drag. That is the window where the store is ahead of the engine,
holding uncommitted preview coordinates, and pausing stops a single socket message mid-run from
snapping the node back under the cursor.

### How many engine instances

**One per screen that edits a flow.** The desktop editor, the mobile editor and the mobile
tutorial each create their own and publish one-way into the store through `useEngineMirror`.
They are not shared.

> Mobile used to write the store directly, with no engine. That is why **server port values
> never reached the graph on load** (only `loadGraph` takes a `ports` argument) and previews
> came up empty of the last run's data. It now enters through the single `loadFlowIntoEngine`.
> Details in `PLAN.md` §15.

`FlowEditorPage` builds one with `createFlowEngine` and hands it down as `engine={engine}`.
`WorkflowCanvas`'s `engineProp ?? fallbackEngine` is the fallback for when the canvas renders
**standalone** (the component-viewer modal) — not a second editor engine.

> This document **points at symbol names rather than line numbers.** Line numbers shift on an
> unrelated merge — the `:760` and `:261` that used to be written here became `:762` and `:264`
> when #120 landed. A symbol goes stale too if it is renamed, but then grep returns nothing, so
> **you find out that it is wrong.**

---

## The path

```
GET /flows/:id/load
  └─ engine.loadGraph(state, { ports })      ← the only ingress
       normalize: mint ids · fill config/position · drop duplicate edges
                  · legacy `connections` field · merge port values · propagate along edges
  └─ setBaseline(...)                        ← what dirty is measured against

edit (engine.transact)
  └─ history push → mirror → useCanvasStore → screen
  └─ (debounce) draftFor(graph) → IndexedDB      ← what survives without pressing save

POST /flows/:id/save
  body = toSnapshot(graph, blockRegistry)    ← **the whole graph. A replace, not a patch**
  └─ rebaseline(saveBody)
  └─ clearDraft()                            ← the server has it, the local copy is redundant
                                                (kept if structureDropped — that work exists nowhere else yet)
```

`loadGraph` being the **single ingress** is one of the central changes here. The canvas used to
merge ports and propagate along edges _before_ calling `loadGraph`, and `repository` (headless)
never got those two passes — so the same response produced a different graph.

### What is **not** saved

Node state and port data produced during a run go in through `engine.applyRuntime`. They are
**not pushed to history and `toSnapshot` drops them.** A run is not an edit — executing a node
leaves the undo stack untouched and creates nothing for the next save to send.

The port values themselves are uploaded separately, to the server's port records
(`upsertPortNode`). That is what backend nodes read.

---

## Looking inside

| What you want                  | How                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| the JSON the canvas holds now  | the **GRAPH** panel on screen (`DevGraphPanel`) — shows `flow / nodes / edges / baseline`, Export/Import           |
| the whole path with no browser | `yarn engine:demo` — `load → add → undo → redo → save → run`                                                       |
| against the real server        | `FLOW_API_URL=… FLOW_API_KEY=… yarn engine:demo --real --flow <id>` (**read-only by default**, `--write` to write) |

---

## Which platforms it runs on

These are all the platform APIs the engine touches. The rest is pure computation.

| What                          | Where                                                 | If absent                             |
| ----------------------------- | ----------------------------------------------------- | ------------------------------------- |
| `crypto.randomUUID()`         | `core/ids.ts`                                         | inject via `configureIds(fn)`         |
| `fetch`                       | `fetchHttpPort`                                       | inject via the `fetchFn` option       |
| `WebSocket`                   | `webSocketPort`                                       | inject via the `createSocket` option  |
| `AbortController`             | `fetchHttpPort` (timeout)                             | present everywhere — one caveat below |
| `setTimeout` / `clearTimeout` | `runSession`, adapters                                | present everywhere                    |
| `process.*`                   | **`cli/main.ts` only** — not exported from the barrel | n/a                                   |

**`URL` is not used.** `fetchHttpPort` used to build its query with `new URL(...)` +
`searchParams.set`, but React Native's `URL` shim has no `searchParams`, or an incomplete one —
which was exactly the part being used. Injection does not solve it (you cannot trust the object
you get back), so the query is assembled directly with `encodeURIComponent` — ES core, present
everywhere including Hermes.

> The encoding differs in exactly one character: **the space**. `URLSearchParams` emits `+`;
> this emits `%20`. The engine's queries contain no spaces, and `%20` is the correct form in a
> URL context. A spec pins it.

**`AbortController` is used as-is** — Node 16+, every modern browser, RN 0.60+. Unlike `URL` it
has no partial-implementation problem, so there is no reason to add a seam for it.

> But the timeout only works **if your `fetchFn` respects `signal`**. Real `fetch` does
> everywhere; inject a custom transport that ignores `signal` and the 30-second timeout quietly
> stops existing, leaving `repository.load()` hanging forever. Check this if you supply your own
> transport.

Compiling with `lib: ["ES2022"]` (no DOM) is what guarantees **no DOM API is used**. But
`globalThis.crypto` sits outside the DOM lib, so the compiler will not catch it — hence the table
above.

**Node 22 and https/localhost browsers need no setup at all.** Only two cases lack
`crypto.randomUUID`, and they need one call at boot:

```ts
import { configureIds } from '@flows/engine'; // outside this repo: '@lemoncloud/flow-engine'
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

configureIds(uuidv4); // React Native (Hermes has no crypto at all)
```

- **React Native / Hermes** — there is no `crypto`.
- **plain-http browsers** — `randomUUID` exists **only in a secure context** (https or
  localhost). Serve on a LAN IP and `crypto` is there but the method is not.

It is per process, not per engine instance. Ids land in a single server keyspace, so two engines
in one process drawing from different sources is a bug, not a feature. An injected value also
gets its dashes stripped — `-` is the character the server rewrites as a port separator, so
letting it through puts a node and a port on the same row.

> **One exception to "per process"** — the injected state is a module variable, so entering the
> npm package through **both** `import` and `require` creates two registries and `configureIds`
> only changes one. A single consumer using both entry points is rare enough that this was left
> alone; just know it exists.

> **IndexedDB is not in the engine.** `draftStorage.ts` belongs to `libs/flows` (browser), and
> the engine's `persistence/draft.ts` only **builds and returns a draft object** via
> `draftFor()`. Where it goes is the host's decision — MMKV on RN, a file on Node.

---

## Driving it from Node

You can build, save and execute a graph with no browser, React or store. `fetch` and `WebSocket`
come from Node 22's globals — there is no browser branch.

### 1. Start with the demo

```bash
yarn engine:demo                                   # stub server, zero network
```

It runs `load → add → undo → redo → save → run` end to end and prints `OK` or `FAILED` (exit 1
on failure, so it drops straight into CI).

```bash
FLOW_API_URL=https://…/_api_ FLOW_API_KEY=… \
FLOW_WS_URL=wss://…            \
  yarn engine:demo --real --flow 1007934
```

- **`--real` is read-only by default** — it stops after load. `--write` for add/save,
  `--write --run` to execute. Save replaces the whole graph, so writing to someone else's flow
  is hard to undo.
- Without `FLOW_WS_URL` it skips the socket and the run step.
- A read-only run **only asserts what it actually did**. Checking "the count is the same after
  undo" passes automatically when nothing was added, so in that case the edit invariants are not
  checked at all.

### 2. Write your own script

```ts
import { createApiKeyAuth, createFetchHttpPort, createFlowWorkspace } from '@flows/engine';

const http = createFetchHttpPort({
    baseUrl: process.env.FLOW_API_URL!,
    auth: createApiKeyAuth(process.env.FLOW_API_KEY ?? null),
});

const { engine, repository } = createFlowWorkspace({ http });

await repository.load('1007934');
console.log(engine.getGraph().nodes.length, repository.isDirty()); // → 4  false

engine.transact('add', ops => ops.addNode({ type: 'input-text', position: { x: 0, y: 0 } }));
console.log(repository.isDirty()); // → true
engine.undo();
console.log(repository.isDirty()); // → false  (back to exactly the loaded graph)
```

To follow a run, attach a socket and a session. **Register the waiter before the run request** —
the server starts streaming the moment it accepts, so waiting afterwards misses the whole run.

```ts
import { createWebSocketPort, createRunSession } from '@flows/engine';

const socket = createWebSocketPort({ url: wsUrl }); // ?x-api-key=…&info=&channels=0000
const session = createRunSession({ engine, socket, currentFlowId: flowId });
socket.connect();

const settled = session.waitForNode(nodeId, { timeoutMs: 15_000 });
await repository.runNode(nodeId, undefined, {
    async: true,
    propagate: true,
    connection: session.connectionId() ?? undefined, // ← without it the server streams to nobody
});
console.log((await settled).state); // → 'COMPLETED'
session.close();
socket.close();
```

**A run's frames do not arrive in order, and the session is what makes that safe.** It folds
every frame through the reducer: one at or behind the sequence high-water mark is dropped, a new
`runId` puts the node back to IDLE first, and a state less final than the one already written is
refused — `ERROR` outranks `COMPLETED`, so a late success cannot bury a failure.

If you write run state from anywhere else — polling `GET /nodes/:id`, replaying a log, your own
socket handler — none of that applies and `applyRuntime` takes whatever you give it. Ask first:

```ts
import { shouldUpdateState } from '@lemoncloud/flow-engine';

if (shouldUpdateState(node.state, serverState)) {
    engine.applyRuntime(node.id, { state: serverState, status: serverState });
}
```

Two things it will not tell you:

- A state the engine does not model takes **last-write**, not a refusal. The server's
  `NodeStatusType` declares three the `NodeState` union does not (`''`, `WAITING`, `SKIPPED`),
  and `parseSocketFrame` drops the value rather than the frame.
- `applyRuntime` merges shallowly, so **omit the key** when you have nothing to say. A `state`
  held as `undefined` is not "no opinion" — it erases the node's own.

**Running it** — outside Vitest the `@flows/*` aliases do not resolve, so bundle first (the same
thing the `engine:demo` script does):

```bash
npx esbuild my-script.ts --bundle --platform=node --format=esm --target=node22 \
  --outfile=dist/my-script.mjs && node dist/my-script.mjs
```

For a single file you can also import by relative path (`libs/engine/src/...`) and run it
directly with `npx tsx`.

**Outside the repo you do not need a bundler** — the engine is published as
**`@lemoncloud/flow-engine`**. Both `import` and `require` work (two separate builds). The bundle
imports nothing at runtime, but **`dependencies` is not empty**: the published `.d.ts` reference
types from `@lemoncloud/eureka-flows-api`, so that one really is installed.

```bash
npm i @lemoncloud/flow-engine
```

```ts
import { createFlowEngine } from '@lemoncloud/flow-engine'; // ESM
```

```ts
const { createFlowEngine } = require('@lemoncloud/flow-engine'); // CJS
```

> Inside the repo we keep using the `@flows/engine` alias (straight to source). The two names
> point at the same code; rewriting 200+ imports to the published name costs more than it
> returns. The tarball comes from `npm pack` in `libs/engine` — `prepack` produces `build/` with
> the d.ts plus `.mjs`/`.cjs`.

### 3. Writing specs

`libs/engine` runs with `environment: 'node'`. Put new specs in `libs/engine/src/__tests__/` and
run `npx nx test flow-engine`. You do not need to stub every port — `HttpPort` has one method and
`SocketPort` has five (see `cli/stubHttpPort.ts`, `cli/stubSocketPort.ts`).

> **Copy the server's response shape into your stub, not the client's code.** One of the four
> defects hid behind exactly that, with 255 unit specs green — the stub fixture had a top-level
> `type` field the server has never once sent. Details in `PLAN.md` §11.

---

## Where to look next

|                         |                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `CLAUDE.md`             | repo-wide conventions. The State / Data Flow sections match this design — the store is a projection, the engine owns the graph |
| `docs/engine/PLAN.md`   | the phase 0–6 execution plan, invariants, defect reproductions, corrections. Publishing decisions are §14 (Korean)             |
| `libs/engine/README.md` | **`@lemoncloud/flow-engine`** — the npm page itself. The first page an outside consumer sees                                   |
