/**
 * Moved to `@flows/engine`. Kept here so callers that import the file directly keep
 * working; remove once nothing imports this path.
 */
export { emptySnapshot, toSnapshot } from '@flows/engine';

export type { FlowSnapshot, GraphLike } from '@flows/engine';
