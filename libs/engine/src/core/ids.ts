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

/** A source of UUID-shaped strings. Dashes are fine — they are stripped either way. */
export type RandomUUID = () => string;

/**
 * Installed once, for the whole process — not per engine.
 *
 * Minting is a **platform capability**, like `fetch`, not a policy an engine gets to hold
 * an opinion about: two engines in the same process drawing ids from different sources
 * would be a bug, since every id they mint lands in one server keyspace. So this is a
 * module-level seam rather than a constructor argument, which also means the call sites
 * that mint outside any engine — `deduplicateEdges`, `pasteNodes`, the mobile editor's
 * hooks — are covered by the same single call.
 */
let installed: RandomUUID | null = null;

/**
 * Point id generation at the platform's UUID source. Pass `null` to go back to the default.
 *
 * Needed wherever `crypto.randomUUID` is missing:
 * - **React Native / Hermes** — has no `crypto` at all; polyfill and pass it here.
 * - **A browser on plain http** — `randomUUID` exists only in a secure context, so an app
 *   served over a LAN IP has `crypto` but not this method.
 *
 * Node 19+ and any https/localhost browser need no call.
 */
export const configureIds = (randomUUID: RandomUUID | null): void => {
    installed = randomUUID;
};

/**
 * Reached through `globalThis` so the same call works in a browser and under Node 22,
 * where `crypto` is a global but not an ambient binding the DOM lib declares.
 *
 * The absence is checked rather than left to throw on its own: `undefined is not a
 * function` says nothing about which of the two platform gaps above you hit, and this is
 * the failure a host meets first on a runtime that needs `configureIds`.
 */
const platformRandomUUID = (): string => {
    const uuid = globalThis.crypto?.randomUUID;
    if (typeof uuid !== 'function') {
        throw new Error(
            'No crypto.randomUUID on this platform — call configureIds() with one. ' +
                'React Native needs a polyfill; browsers only expose it over https or localhost.'
        );
    }
    return uuid.call(globalThis.crypto);
};

/**
 * The strip stays here rather than being asked of the caller. An injected generator that
 * returns a dashed UUID would otherwise mint `n1234-5678`, and `-` is the one character
 * the server rewrites into the port separator — the collision this charset exists to
 * avoid. Normalizing on the way out means injection cannot change the wire format.
 */
const newId = (prefix: string): string => `${prefix}${(installed ?? platformRandomUUID)().replace(/-/g, '')}`;

export const newNodeId = (): string => newId('n');

export const newEdgeId = (): string => newId('e');
