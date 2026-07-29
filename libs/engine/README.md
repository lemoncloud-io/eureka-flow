# @lemoncloud/flow-engine

Headless flow engine for [Eureka Flow](https://flow.eureka.codes). Owns the graph — editing,
undo/redo, clipboard, snapshot/diff/baseline, the execution-state reducer — with **no DOM and
no framework**, so the same rules run in a browser, in Node, and (with one injected id source)
in React Native. It is compiled with `lib: ["ES2022"]`, so the absence of DOM is a compile
error rather than a convention.

The bundles import nothing at runtime — the single dependency
(`@lemoncloud/eureka-flows-api`) exists because the published declarations reference its
types. Ships ESM and CommonJS from one source.

```bash
npm i @lemoncloud/flow-engine
```

```ts
import { createFlowEngine } from '@lemoncloud/flow-engine'; // ESM
const { createFlowEngine } = require('@lemoncloud/flow-engine'); // CJS

const engine = createFlowEngine();
engine.transact('add-node', ops => ops.addNode({ type: 'input-text', position: { x: 0, y: 0 } }));
engine.undo();
engine.getGraph(); // { nodes, edges }
```

## The one distinction to get right

**An edit and a run are different things, and they go through different methods.**

```ts
engine.transact('node:config', ops => ops.updateNode(id, { config })); // an edit
engine.applyRuntime(id, { state: 'RUNNING', outputData }); // a run
```

`transact` is the only way to change the graph's _shape or content_. It checkpoints for undo,
rejects illegal edits (cycles, duplicate edges, incompatible port types), and everything it
writes is part of what a save sends.

`applyRuntime` carries what a _run_ produced — node state, output. It lands **outside history**
and `toSnapshot` drops it, so executing a node leaves nothing for the next save to send and
nothing for undo to step back through. Route run state through `transact` and you get a save
body full of transient status; route edits through `applyRuntime` and they vanish on save.

Note `applyRuntime` is a shallow replace (`{ ...node, ...patch }`), not a deep merge — pass
nested objects like `inputData` whole, or merge them yourself first.

## Loading

`loadGraph` is the single ingress. It normalizes the response, mints missing ids, folds server
port values into the nodes, and propagates each output to its downstream inputs:

```ts
engine.loadGraph({ nodes, edges }, { ports: portRows.filter(p => p.data !== undefined) });
```

The `ports` argument is easy to skip because the rows arrive _beside_ the nodes rather than
inside them. Skip it and the graph knows its shape but nothing its last run produced — every
preview reads empty until something runs. Dropping `undefined` rows is deliberate: `undefined`
is the server declining to answer, `null` is it saying the port is empty, and only the second
is news.

## Ports and options

The engine talks to a server through ports you supply — `HttpPort`, `AuthPort`, `SocketPort`
(`fetch` and `WebSocket` adapters are included, and both are injectable). Nothing else touches
a platform global except `crypto.randomUUID`, which `configureIds(fn)` replaces where it is
missing.

`createFlowEngine` takes one option:

```ts
createFlowEngine({ getBlockRegistry: () => registry });
```

A getter, not a value, because the registry usually arrives over the network — an engine built
with the empty map would skip port-type checks for the rest of the session. Omit it entirely and
`connect` simply never raises `INCOMPATIBLE_PORTS`; cycle and duplicate checks still apply.

## Consuming it

**`skipLibCheck: true` is required.** The declarations reference
`@lemoncloud/eureka-flows-api`, whose own `.d.ts` files point at a package they do not depend on
(`@lemoncloud/eureka-agents-api`, TS2307) and carry index-signature errors from `lemon-model`.
Neither reaches this engine's own types — `tsc` only surfaces them when it checks the whole
dependency tree.

**`build/package.json` (`{"type":"commonjs"}`) is load-bearing — do not delete it.** It looks
redundant next to the explicit `.mjs`/`.cjs` extensions, but it is what makes `build/*.d.ts` read
as CommonJS declarations, which is what keeps their extensionless re-exports (`export * from
'./core'`) resolvable. Without it the root `"type": "module"` applies and a `node16`/`nodenext`
consumer gets `TS2305: has no exported member` for every export while `require()` keeps working at
runtime. `.mjs` still wins on extension, so ESM consumers are unaffected. Rationale and the
reverted-and-reproduced check: `docs/engine/PLAN.md` §14.

Verified consumer matrix (packed tarball, v0.1.0): CJS + `node10`, CJS + `nodenext`, and
ESM + `nodenext` all typecheck clean and load at runtime.

**Full guide:** [`docs/engine/GUIDE.md`](https://github.com/lemoncloud-io/eureka-flow/blob/e2402f1/docs/engine/GUIDE.md)
— where the graph lives, the load → edit → save path, the platform table, and how to script it
from Node.
