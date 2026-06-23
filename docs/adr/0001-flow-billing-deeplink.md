# 1. Flow integrates billing via an outbound deep-link, not embedded payment

Date: 2026-06-06
Status: Accepted

## Context

Users consume account-scoped **credits** when AI blocks run in flow. They need a
way to buy more. The payment system lives in a separate app
(`billing.example.com`, OAuth-authenticated), which owns all charge/refund/ledger
logic. Three constraints shape how flow can connect to it:

1. **flow is Apache-2.0 open source** — it cannot contain payment/Stripe logic.
2. **flow authenticates with an API key** (localStorage); billing uses OAuth.
   There is no shared token to hand off between them.
3. **billing already exists** and fully implements the credit/payment UI.

## Decision

flow links _out_ to the billing app; it never embeds payment.

- **v1 = charge button only.** A `ChargeCreditsButton` opens the billing app in a
  **new tab**. No in-app balance display yet (deferred — see Consequences).
- **The deep-link carries no identity.** URL is
  `{VITE_BILLING_URL}?from=flow&return_to={current flow URL}`. billing
  authenticates the user itself via OAuth and resolves `accountId` server-side.
  A client-supplied accountId would be spoofable, so none is sent.
- **`return_to` is honored by billing only after host-allowlist validation**
  (`*.eureka.codes`) to prevent open-redirect/phishing. On the charge-complete
  screen billing shows a manual "back to flow" link; it never auto-redirects.
- **The button is env-gated.** It renders only when `VITE_BILLING_URL` is set, so
  open-source self-hosters (who have no billing app) never see a dead button.
- **Workspace context exception (amended 2026-06-09).** Credits are
  **workspace-scoped** (backend deploys a per-workspace wallet — see billing
  decisions ADR-9). Identity hierarchy is **Site(`sid`) ⊃ Workspace(`workspaceId`)
  ⊃ Wallet**; `sid` and `workspaceId` are _different_ identifiers. The deep-link
  MAY carry a workspace _hint_ so billing pre-selects the right wallet — but the
  hint must be a **workspace identifier**, not the key's `sid` (which is the
  parent site). ⚠️ **Open:** the apiKey claim exposes only `sid`+`uid`, no
  `workspaceId`; flow needs a way to learn its key's workspaceId (e.g. backend
  adds it to `flows/0/profile`) before this hint can be precise. Whatever is
  passed is **not** an auth token — billing still OAuth-logs-in and re-validates
  membership server-side, so a spoofed hint grants nothing. The "no identity"
  rule still bans tokens/apiKeys in the URL.

## Consequences

- flow stays payment-free and license-clean; all PCI/refund surface stays in billing.
- No token-handoff complexity; the cost is the user logs into billing separately
  (acceptable — billing is an occasional destination, not a hot path).
- New tab preserves the user's editor work (no same-tab navigation loss).
- **A1 ACTIVATED (2026-06-09):** in-app credit balance + usage history inside flow.
  The backend now exposes api-key-signed reads (`flw-v1/_api_/wallets/0/balance`,
  `.../transactions/0/list`), so the deferral reason is gone. flow shows balance +
  usage read-only next to the charge button; payment (charge execution) still
  delegates to billing via deep-link (flow stays payment-free).
- Cross-app URL contract (`from`, `return_to`) and the allowlist now span two
  repos; changing it requires coordinated edits in flow and billing.
