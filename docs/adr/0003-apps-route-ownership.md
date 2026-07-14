# Apps route: the SPA owns `/apps` only, never `/apps/:id`

An **App** (a deployed AI Studio web app, see `CONTEXT.md`) is already reachable at
`https://flow.eureka.codes/apps/:id`, but that URL is **not served by this SPA**. CloudFront routes
`/apps/:id` to `eureka-flows-api`, whose `AppsAPIController` (`src/modules/flows/api-apps.ts`) reads
the App's own `index.html` out of its S3 deploy prefix, injects OG meta and a pre-rendered body for
crawlers, and serves its assets as base64 binary. The App is a separate SPA with its own bundle; the
flow SPA never renders it. `/apps` (no id) is the only path under that prefix CloudFront leaves to
this app — it currently falls through to `NotFoundPage`.

We decided the flow SPA owns exactly one route, **`/apps`** — a read-only list of the Apps the
signed-in user's **Workspace** owns. Opening an App is a **hard navigation out**
(`<a href="{SITE_URL}/apps/{id}">`), not a client-side route transition. We deliberately do **not**
register a `/apps/:id` React route: in production CloudFront intercepts that path before the SPA
ever sees it, so such a route could only ever match on `localhost` — a phantom that works in dev and
silently dies in prod, which is worse than not having it.

The list is read-only by design. An App's lifecycle lives entirely outside flow: it is created by
the **Injection** pipeline and its identity is a codes Product (`stereo: 'front'`) owned by the codes
console. flow has no way to create an App, so it also grants no way to delete or redeploy one — a
half-manager that can only destroy is worse than a launcher.

## Considered Options

- **SPA owns `/apps` only; detail is a hard nav (chosen)** — matches how the URL is actually served.
  One route, one endpoint, no phantom routes. The link is built from the absolute `SITE_URL` rather
  than a relative path so that it resolves in local dev too, where CloudFront does not exist.
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
  Process Navigator uses). The mock rows carry **real production App ids**, so clicking a card opens
  a real App — the scaffold is verifiable, not a placeholder.
- `AppView`'s fields are inferred from the codes `ProductModel` and are expected to be corrected once
  the real endpoint ships. They are treated as a guess, not a contract.
- The card link is built from `SITE_URL`, which is **production**. That holds only while the ids come
  from the PROD-id mock. When the real endpoint ships it will return **DEV** ids on DEV, and those
  do not resolve under the production domain — at that point switch to a relative href (correct on
  any CloudFront-backed deploy) or an env-aware base. `SITE_URL` is the local-dev fix, not the
  end state.
- Apps have no per-App preview image (the server's OG tag uses a single static screenshot for all of
  them), so cards are text-first on a uniform grid. Masonry — which exists on `/flows` only because
  flow thumbnails vary in height — would buy nothing here.
