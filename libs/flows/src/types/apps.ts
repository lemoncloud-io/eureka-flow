/**
 * App types
 *
 * An App is a deployed AI Studio web app whose GenAI calls were rewritten to run
 * through the flow backend (see `CONTEXT.md`). Its identity lives in codes, not flow:
 * an App is a codes Product surfaced by the public SEO list endpoint.
 *
 * flow only lists Apps and links out to them — an App is served at its own
 * server-provided `url`, never by this SPA.
 *
 * @see docs/adr/0003-apps-route-ownership.md
 */

/**
 * AppSeoMeta - one App's SEO / Open Graph metadata, from `GET /_seo_/apps/0/list`.
 *
 * Shapes mirror the server spec exactly. Only `title`, `image` and `description` are
 * guaranteed; every other field is optional (may be absent depending on the upstream
 * product API). `lastmod` is a Unix timestamp in milliseconds.
 */
export interface AppSeoMeta {
    /** App product id (e.g. '1018107'). */
    id?: string;
    /** Open Graph type — currently 'website'. */
    type?: string;
    /** SEO title: the App name combined with the site name. */
    title: string;
    /** Open Graph image URL (a single shared screenshot across all Apps). */
    image: string;
    /** App description. */
    description: string;
    /** Canonical App URL (`${BASE_SEO}/${id}`). Use verbatim — never re-compose client-side. */
    url?: string;
    /** Representative image width. May be absent. */
    width?: number;
    /** Representative image height. May be absent. */
    height?: number;
    /** product `updatedAt` as a Unix timestamp in milliseconds. */
    lastmod?: number;
    /** SEO site name. */
    siteName?: string;
}

/** One aggregation bucket from the upstream product API. */
export interface AppsAggrItem {
    key: string;
    val: number;
}

/**
 * AppsSeoListResult - `GET /_seo_/apps/0/list` response.
 *
 * `list` is always an array. The pagination (`total`/`limit`/`page`/`took`) and
 * `aggr` fields are optional and may be omitted depending on the upstream response.
 */
export interface AppsSeoListResult {
    total?: number;
    limit?: number;
    page?: number;
    took?: number;
    list: AppSeoMeta[];
    aggr?: AppsAggrItem | AppsAggrItem[];
}
