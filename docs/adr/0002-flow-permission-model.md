# Flow permission model: server is source of truth, client models four roles

The server (`eureka-flows-api`) already distinguishes **ownership** (`isOwner` = same `sid`+`uid`)
from **edit permission** (`isEditable` = same workspace `sid`, or the per-flow `openToEdit`
flag), and gates **structural** changes (`/flows/:id/upsert` — add/delete/move/connect/rename)
to owners only while allowing non-owner **config** edits through the `/save` overlay. The client
collapsed all of this into a single `isEditable` boolean and treated it as ownership, so a
same-workspace Editor was rendered the owner UI and triggered owner-only `/upsert` calls →
production `403 NOT ALLOWED - owner only`.

We decided to make the client mirror the server model rather than invent a client-only
heuristic: the `/load` response carries both `isOwner` and `isEditable` (required booleans), and
the client derives four roles — **Owner / Editor / Viewer / Anonymous** — from those two plus
apiKey presence. We split **Config edit** (Owner + Editor) from **Structural edit** + flow
metadata/rename/publish (Owner only). An Editor may edit **any** node's config — the server now
routes a non-owner's writes into a per-user **Session overlay** (`SessionModel`) on both
`/flows/:id/save` and `/nodes/:id/upsert`, leaving the original flow untouched. The 403 fix is the
role split itself: binding the name input and structural controls to Owner (not "editable")
removes the owner-only `/upsert` an Editor used to trigger; no extra client write-guard is needed.

## Considered Options

- **`isOwner` + `isEditable` booleans on `/load` (chosen)** — the client composes roles from the
  two booleans + apiKey presence. The client keeps its own Anonymous concept (no apiKey), which a
  server role enum could not express anyway.
- **`role` enum from the server** — rejected: couples the server to client role names and still
  can't express the apiKey-presence (Anonymous) distinction, which is purely a client concern.
- **Client-only, no server change** — rejected: without `isOwner` the client cannot tell Owner
  from Editor, forcing every editable-but-unconfirmed user down to Viewer and removing the
  config/run access workspace teammates are entitled to.

## Consequences

- `setIsEditable`/`setIsOwner` default to `false` (never `true`) so a missing field can never
  escalate to edit access.
- `openToEdit` is **not** modeled on the client. It is already folded into the server's
  `isEditable`, and is settable only on localhost — so the client treats Structural edit as
  Owner-only. The only effect is that on a (rare, localhost) Open-to-Edit flow an Editor sees no
  structural affordance even though the server would permit it — strictly more restrictive than
  the server, never less, so it can never cause a 403.
- A residual `permission_denied` (race / stale role) is handled as a toast plus a flow refetch to
  resync the role, rather than a silent failure.
