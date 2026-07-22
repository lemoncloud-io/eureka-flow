/**
 * upload-html output types
 *
 * The `upload-html` processor deploys an HTML bundle as an App and emits the resulting product on
 * its `out` port. Every field is optional — the server drops `undefined` keys (`onlyDefined()`), and
 * a mock run emits `{ website }` alone.
 *
 * Only the fields the product card reads are typed here. The response also carries `workspaceId` and
 * a `progress$` deployment snapshot; both are deliberately left out until something consumes them.
 * If you add `progress$`, note the trap: `website` is composed as soon as a product id exists, and
 * `progress$.status === 'success'` means the stage named by `progress$.state` succeeded — neither
 * says the deploy finished.
 */

export interface UploadHtmlWorkspaceView {
    /** Workspace code (e.g. '@1005802'). */
    code?: string;
}

export interface UploadHtmlProductView {
    /** Product id (e.g. '1017866'). Same value as the node's `pid` output. */
    id?: string;
    name?: string;
    /** Display name, not a region code (e.g. 'Asia Pacific (Seoul)'). */
    region?: string;
    workspace$?: UploadHtmlWorkspaceView;
    /** App URL, `${BASE_SEO}/apps/<productId>`. Present before the deploy completes. */
    website?: string;
}
