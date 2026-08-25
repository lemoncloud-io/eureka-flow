import { runRequirement as requirementFor } from '@flows/engine';

import { workspaceContext } from './context';

import type { GraphLike, RunRequirement } from '@flows/engine';

export type { RunRequirement } from '@flows/engine';

/**
 * What has to happen before the server can run this graph — see `@flows/engine`
 * (`persistence/runGate.ts`) for why a non-owner editor's structural change is the one
 * case saving cannot rescue.
 */
export const runRequirement = (graph: GraphLike): RunRequirement => requirementFor(graph, workspaceContext());
