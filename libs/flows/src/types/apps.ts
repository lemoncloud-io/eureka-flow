/**
 * App types
 *
 * An App is a deployed AI Studio web app whose GenAI calls were rewritten to run
 * through the flow backend (see `CONTEXT.md`). Its identity lives in codes, not flow:
 * an App is a codes Product with `stereo: 'front'`.
 *
 * flow only lists Apps and links out to them — `/apps/:id` is served by CloudFront,
 * not by this SPA.
 *
 * @see docs/adr/0003-apps-route-ownership.md
 */

/**
 * AppView - view representation of a deployed App.
 *
 * NOTE: `GET /apps?view=mine` does not exist yet. These fields are inferred from the
 * codes `ProductModel` and are a guess, not a contract — correct them once the real
 * endpoint ships.
 */
export interface AppView {
    /** Product id (e.g. '1016828'). The path segment of the App's URL. */
    id: string;
    /** Display name. Falls back to `code` when absent. */
    name?: string;
    /** Deploy code / slug (e.g. 'ai-content-banner-generator'). */
    code: string;
    /** Service status (실행상태) from codes. */
    status?: string;
    /** Deploy timestamp (epoch ms). */
    deployedAt?: number;
    /** Last update timestamp (epoch ms). */
    updatedAt?: number;
}
