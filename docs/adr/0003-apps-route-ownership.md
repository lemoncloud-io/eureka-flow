# Apps route: the SPA owns `/apps` only, never `/apps/:id`

An **App** (a deployed AI Studio web app, see `CONTEXT.md`) is already reachable at
`https://flow.eureka.codes/apps/:id`, but that URL is **not served by this SPA**. CloudFront routes
`/apps/:id` to `eureka-flows-api`, whose `AppsAPIController` (`src/modules/flows/api-apps.ts`) reads
the App's own `index.html` out of its S3 deploy prefix, injects OG meta and a pre-rendered body for
crawlers, and serves its assets as base64 binary. The App is a separate SPA with its own bundle; the
flow SPA never renders it. `/apps` (no id) is the only path under that prefix CloudFront leaves to
this app — it currently falls through to `NotFoundPage`.

We decided the flow SPA owns exactly one route, **`/apps`** — a read-only list of the Apps the
signed-in user's **Workspace** owns. Opening an App is a **hard navigation out** — a plain
`<a href="/apps/{id}">`, not a react-router `<Link>` and not a client-side route transition. We
deliberately do **not** register a `/apps/:id` React route: in production CloudFront intercepts that
path before the SPA ever sees it, so such a route could only ever match on `localhost` — a phantom
that works in dev and silently dies in prod, which is worse than not having it.

The href is **relative**, so it resolves against whichever origin serves the page: the DEV deploy
opens DEV Apps, PROD opens PROD ones. The cost is that on `localhost` — the one place with no
CloudFront in front of the SPA — an App link lands on the catch-all and 404s. We accept that:
App links are verified on a deployed environment, and the alternative (an absolute production
`SITE_URL`) makes local clicks work by sending every environment's users to production Apps, which
breaks for real as soon as the list endpoint starts returning DEV ids on DEV.

The list is read-only by design. An App's lifecycle lives entirely outside flow: it is created by
the **Injection** pipeline and its identity is a codes Product (`stereo: 'front'`) owned by the codes
console. flow has no way to create an App, so it also grants no way to delete or redeploy one — a
half-manager that can only destroy is worse than a launcher.

## Considered Options

- **SPA owns `/apps` only; detail is a hard nav to a relative href (chosen)** — matches how the URL
  is actually served. One route, one endpoint, no phantom routes, and each environment opens its own
  Apps. Local dev is the one place it 404s, since nothing sits in front of the SPA there.
- **Absolute `SITE_URL` href** — rejected: it makes the link work on `localhost`, but it hardwires
  production, so a DEV deploy would send users to production Apps and 404 on every DEV-only App id.
  Trading a real cross-environment bug for a local-dev convenience is the wrong way round.
- **SPA owns `/apps/:id` and embeds the App in an iframe** — rejected: duplicates a URL CloudFront
  already owns, breaks the server-rendered OG meta/crawler path that exists precisely so Apps are
  shareable, and nests a second SPA (with its own credit pill and API-key modal) inside this one.
- **Serve Apps under a different prefix to free `/apps/:id` for the SPA** — rejected: the prefix is
  already live in production, baked into the CloudFront behavior, the API controller, and the
  `referer`-based asset lookup. Moving it to win a client-side route is a large infra change for no
  user-visible gain.
- **Full CRUD management screen** — rejected: flow cannot create Apps, so it should not own their
  deletion or redeployment either. That authority stays with the codes console.

## Consequences

- Any future work that "adds an App detail page" must change CloudFront first. The absence of a
  `/apps/:id` route in `app.tsx` is intentional; do not add one.
- The list endpoint (`GET /apps?view=mine`) does not exist yet. Until it does, `libs/flows/src/api/apps.ts`
  returns mock rows behind a `VITE_APPS_API === 'real'` flag (the same mock/real swap convention the
  Process Navigator uses). Only App ids verified to resolve belong in that mock — a card whose link
  404s is worse than no card.
- `AppView`'s fields are inferred from the codes `ProductModel` and are expected to be corrected once
  the real endpoint ships. They are treated as a guess, not a contract.
- App links **404 on `localhost`** by construction. Verify them on a deployed environment. A Vite dev
  proxy forwarding `/apps/:id` to the API would close the gap if it ever becomes worth the setup.
- Apps have no per-App preview image (the server's OG tag uses a single static screenshot for all of
  them), so cards are text-first on a uniform grid. Masonry — which exists on `/flows` only because
  flow thumbnails vary in height — would buy nothing here.
