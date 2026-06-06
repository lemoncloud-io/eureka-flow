# 1. Flow integrates billing via an outbound deep-link, not embedded payment

Date: 2026-06-06
Status: Accepted

## Context

Users consume account-scoped **credits** when AI blocks run in flow. They need a
way to buy more. The payment system lives in a separate app
(`billing.eureka.codes`, OAuth-authenticated), which owns all charge/refund/ledger
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

## Consequences

- flow stays payment-free and license-clean; all PCI/refund surface stays in billing.
- No token-handoff complexity; the cost is the user logs into billing separately
  (acceptable — billing is an occasional destination, not a hot path).
- New tab preserves the user's editor work (no same-tab navigation loss).
- **Deferred (future, "A1"):** showing the live credit balance inside flow. This
  requires the billing backend (`crd-d1`) to accept an **API-key-signed** balance
  read (today it validates OAuth only). Until that backend capability exists, flow
  shows the button but not the balance. Revisit when backend confirms support.
- Cross-app URL contract (`from`, `return_to`) and the allowlist now span two
  repos; changing it requires coordinated edits in flow and billing.
