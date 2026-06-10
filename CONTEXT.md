# CONTEXT — eureka-flow

Glossary of domain terms. No implementation details. Update as terms are resolved.

## Identity

- **accountId** — The single account identity that ties a user across flow, console, and billing to **one credit ledger**. In flow it is resolved from the API key's profile (`$user.accountId`); in billing it comes from the OAuth profile. The same person has the same accountId everywhere. It is the key the credit ledger is stored against.

## Credits

- **Credit** — The account-scoped virtual currency consumed when AI blocks run in flow. Owned at the **account** level (not workspace, not project).
- **Credit balance** — Total spendable credits for an accountId. Read-only from flow's perspective.
- **Credit charge (충전)** — The act of buying credits. **Always happens in the billing app, never inside flow.** From flow, "charge" means leaving for billing.

## Cross-app

- **Billing app** — The separate `billing.example.com` application (OAuth-authenticated) that owns all payment, charge, refund, and ledger-mutation logic. flow links _out_ to it.
- **Charge deep-link** — An outbound, new-tab navigation from flow to the billing app carrying only `from` (source tag) and `return_to` (where to come back to). Carries no identity — billing authenticates the user itself.
