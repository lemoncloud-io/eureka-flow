export type { CanvasBinding, EdgeSpec, Graph, NodePatch, XY } from './canvasBinding';
export { createEngineCanvasBinding } from './engineCanvasBinding';
export { createInMemoryCanvasBinding } from './inMemoryCanvasBinding';
export { tracingCanvasBinding } from './tracingCanvasBinding';
export { applyMove, hasExactlyOneTarget } from './moveSemantics';
export type { Delta, MoveNodeArgs } from './moveSemantics';
// Edge validation (`arePortTypesCompatible`, `wouldCreateCycle`) is NOT re-exported here: it lives in
// `@flows/engine`, which both the edge tools and apps/web import directly. One implementation, no hop.
