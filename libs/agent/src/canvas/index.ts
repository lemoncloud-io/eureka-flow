export type { CanvasBinding, EdgeSpec, Graph, NodePatch, XY } from './canvasBinding';
export { createInMemoryCanvasBinding } from './inMemoryCanvasBinding';
export { applyMove, hasExactlyOneTarget } from './moveSemantics';
export type { Delta, MoveNodeArgs } from './moveSemantics';
export { arePortTypesCompatible, wouldCreateCycle } from './edgeSemantics';
