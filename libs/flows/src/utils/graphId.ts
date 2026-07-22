/**
 * Client-side node/edge IDs.
 *
 * `POST /flows/:id/save` upserts by ID: an ID the server has never seen is created
 * with that exact value (`upsertNodesV2` -> get-or-make), so what we generate here
 * is the canonical ID. No round-trip, no reconciliation.
 *
 * The charset is not cosmetic. Server-side these characters are load-bearing:
 * - `:` separates a port ref (`nodeId:portId`)
 * - `-` collides with `:` — the DynamoDB key builder rewrites `:` to `-`, and ports
 *   share the node keyspace, so node `x-out` and port `x:out` would be one row
 * - `@` separates a run ref (`nodeId@runNo`)
 * - a leading `#` marks a delete and skips the write
 *
 * Hex avoids all four. The leading letter keeps us clear of the server's own IDs,
 * which are numeric strings from a sequence.
 */
const newId = (prefix: string): string => `${prefix}${crypto.randomUUID().replace(/-/g, '')}`;

export const newNodeId = (): string => newId('n');

export const newEdgeId = (): string => newId('e');
