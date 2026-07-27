/**
 * Moved to `@flows/engine`. Kept here so callers that import the file directly keep
 * working; remove once nothing imports this path.
 */
export { parseFlowJson, serializeFlowJson } from '@flows/engine';

export type { FlowJson, ParseFlowJsonResult } from '@flows/engine';
