// Cycle detection is defined once, DOM-free, in `@flows/agent` (`canvas/edgeSemantics.ts`) so the headless
// `edge` tool and this interactive canvas share one implementation. Re-exported here to keep the existing
// `./graph` / `../utils` import sites unchanged. `Connection[]` is structurally `EdgeData[]` (same endpoint
// fields), so the store's connections pass through directly.
export { wouldCreateCycle } from '@flows/agent';
