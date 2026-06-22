# CONTEXT — eureka-flow

Glossary of domain terms. No implementation details. Update as terms are resolved.

## Identity

- **accountId** — The single account identity that ties a user across flow, console, and billing to **one credit ledger**. In flow it is resolved from the API key's profile (`$user.accountId`); in billing it comes from the OAuth profile. The same person has the same accountId everywhere. It is the key the credit ledger is stored against.

## Credits

- **Credit** — The account-scoped virtual currency consumed when AI blocks run in flow. Owned at the **account** level (not workspace, not project).
- **Credit balance** — Total spendable credits for an accountId. Read-only from flow's perspective.
- **Credit charge (충전)** — The act of buying credits. **Always happens in the billing app, never inside flow.** From flow, "charge" means leaving for billing.
- **AI key** — A workspace's own LLM provider key (Gemini/OpenAI), configured server-side and surfaced read-only to the client as `useApiKey` (server-authoritative, else "any provider key present"). It is **not** the **flow API key** (the localStorage credential that authenticates the client to flow) — the two are unrelated keys. _Avoid_: "API key" unqualified (collides with the flow auth key), provider token.
- **Run mode** — Which billing path an AI run takes, decided **server-side**, not a client toggle. **Own AI key** — workspace has an **AI key**, runs use it and **no Credits are charged**; **Credits** — no AI key, runs draw down the **Credit balance**. The client only _surfaces_ the active mode (from `useApiKey`); it never selects it. _Avoid_: BYOK (dev jargon — not user-facing), "key mode".

## Cross-app

- **Billing app** — The separate `billing.example.com` application (OAuth-authenticated) that owns all payment, charge, refund, and ledger-mutation logic. flow links _out_ to it.
- **Charge deep-link** — An outbound, new-tab navigation from flow to the billing app carrying only `from` (source tag) and `return_to` (where to come back to). Carries no identity — billing authenticates the user itself.

## Access model

Server (`eureka-flows-api`) is the source of truth; the client mirrors it via two booleans on `/load` (`hasOwned`, `isEditable`).

- **Owner** — The user who created a flow; server-checked as identity match on both **Workspace** and user (`sid` + `uid`). Only role allowed to make a **Structural edit** or change flow metadata (rename/publish). _Avoid_: creator, author.
- **Editor** — A user who shares the flow's **Workspace** but is not the Owner. Has _edit permission_ (**Config edit** of any node) but **not** ownership; cannot make Structural edits. _Avoid_: collaborator, member.
- **Viewer** — A signed-in user with neither edit permission nor ownership. May open a **Public** flow and run it; changes nothing persistent. _Avoid_: guest (legacy client name — it conflated Editor and Viewer).
- **Anonymous** — A visitor with no session. May view a **Public** flow only; may not run or edit.
- **Workspace** — The tenant grouping (`sid`) a flow and a user belong to. Same-Workspace membership is what grants an Editor their edit permission. _Avoid_: organization, team, account.
- **Structural edit** — Changing a flow's shape: add/delete nodes or edges, move nodes, change connections, plus metadata such as the name. Owner-only. _Avoid_: upsert (endpoint, not concept).
- **Config edit** — Changing any node's configuration values without altering flow shape. Available to Owners (written directly) and Editors (written to their **Session overlay**). _Avoid_: save (endpoint, not concept).
- **Session overlay** — A per-user, per-flow layer (server `SessionModel`) holding an Editor's Config edits. The original flow's nodes/edges are never mutated; on load the overlay is merged back for that user only, so each Editor sees their own config. _Avoid_: draft, fork, copy.
- **Editable** (`isEditable`) — Server shorthand for "has edit permission" — true for **both** Owner and Editor. Does **not** imply ownership; the client's historical bug was treating Editable as Owner.
- **Open-to-Edit** (`openToEdit`) — Per-flow flag promoting every signed-in user to **Editor** regardless of Workspace. Folded into `isEditable` server-side and settable only on localhost, so it is **not** modeled on the client. _Avoid_: shared, collaborative.
- **Public** (`isPublic`) — Per-flow visibility flag letting Viewers and Anonymous visitors open and run a flow. Orthogonal to edit permission — a Public flow is still read-only to non-Editors. _Avoid_: published, open.
