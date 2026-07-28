# @lemoncloud/flow-engine

Headless flow engine for [Eureka Flow](https://flow.eureka.codes). Owns the graph — editing,
undo/redo, clipboard, snapshot/diff/baseline, the execution-state reducer — with **no DOM and
no framework**, so the same rules run in a browser, in Node, and (with one injected id source)
in React Native.

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

The engine talks to a server through ports you supply — `HttpPort`, `AuthPort`, `SocketPort`
(`fetch` and `WebSocket` adapters are included, and both are injectable). Nothing else touches
a platform global except `crypto.randomUUID`, which `configureIds(fn)` replaces where it is
missing.

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

**Full guide:** [`docs/engine/GUIDE.md`](https://github.com/lemoncloud-io/eureka-flow/blob/develop/docs/engine/GUIDE.md)
— where the graph lives, the load → edit → save path, the platform table, and how to script it
from Node.
