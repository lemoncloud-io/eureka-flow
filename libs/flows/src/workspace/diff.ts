/**
 * Moved to `@flows/engine`. Kept here so callers that import the file directly keep
 * working; remove once nothing imports this path.
 */
export { diffSnapshots, hasStructuralChange } from '@flows/engine';

export type { FlowDiff } from '@flows/engine';
