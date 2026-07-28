# @lemoncloud/flow-engine

Headless flow engine for [Eureka Flow](https://flow.eureka.codes). Owns the graph — editing,
undo/redo, clipboard, snapshot/diff/baseline, the execution-state reducer — with **no DOM and
no framework**, so the same rules run in a browser, in Node, and (with one injected id source)
in React Native.

Zero runtime dependencies. Ships ESM and CommonJS from one source.

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

**Full guide:** [`docs/engine/GUIDE.md`](https://github.com/lemoncloud-io/eureka-flow/blob/main/docs/engine/GUIDE.md)
— where the graph lives, the load → edit → save path, the platform table, and how to script it
from Node.
