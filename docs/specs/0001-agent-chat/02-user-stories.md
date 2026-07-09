# User stories

> Part of the [Agent Chat spec](README.md) · Prev: [Requirements](01-requirements.md) · Next: [Architecture & design →](03-architecture.md)

> **Note on block names.** The block types and their ports/config below are real Eureka Flow blocks,
> verified against the definitions in `apps/admin/src/app/features/blocks/consts/mock-blocks.ts` (the
> shipped catalog is served by `listBlocks()` at runtime; `mock-blocks.ts` mirrors it). They are
> illustrative — the agent's actual catalog is whatever `blockRegistry` holds at runtime (FR-7), and
> it resolves exact ports/config from each block's registry definition, never hardcoded.

## Primary flows

**US-1 — Generate a flow from a description.**

> As a new user, I open a blank flow and type _"Take a topic and write a short product blurb, then
> show it."_ The agent works in its draft and, at turn end, proposes a **plan** of three nodes —
> `input-text` → `single-output-generator` (the LLM text block; the text feeds its `prompt` port) →
> `output-preview` — wired in order. I click **Accept**; the plan is promoted and the three nodes
> appear on the canvas at their default positions. I run it and see the generated blurb. (If I want
> them tidied, I use the editor's **Auto Layout** button — the agent doesn't arrange the canvas.)

**US-2 — Edit an existing flow.**

> As an editor, I have `input-text` → `single-output-generator` → `output-preview` that writes a
> product description. I ask _"Also pull out the product's specs as structured JSON."_ The agent
> inspects the graph and proposes a `schema-json-converter` node (text → JSON) whose `code` input taps
> the generator's `out`, feeding a second `output-preview` to display the JSON. It connects them in
> the draft and, after I **Accept** the plan, promotes the change to the live flow.

**US-3 — Troubleshoot a failure.**

> A node is red (`ERROR`). I ask _"Why did the generator fail?"_ The agent reads the node's `error`
> and last `RunContext` traces and checks the block's registry contract: an `input-image` (`image`
> output) is wired into the generator's `prompt` port, which is `text`. It explains the type mismatch
> and — since the generator _does_ take images on its `image0` port — offers to move that edge to
> `image0` and feed `prompt` from a text source. I **Accept** the fix (it rides in the turn's plan
> like any other edit) and re-run.

**US-4 — Execute and report.**

> I ask _"Run the whole thing and tell me what each output produced."_ The agent calls `run_flow`,
> watches node events over the socket, waits for terminal states, then summarizes what each terminal
> node received — the blurb and the specs JSON, both landing in `output-preview` nodes — read from
> their `in` ports via `getPortData`, flagging any that errored.

**US-5 — Refine over multiple turns.**

> After US-1, I say _"Make the blurb shorter and more formal."_ The agent doesn't rebuild anything.
> The generator's main prompt is an **input port** (fed by `input-text`), but tone/format is governed
> by its `system` (System Prompt) config field — so the agent edits that config value (config edit,
> FR-9), shows the one-line change in the plan, and promotes it on **Accept**. (It could equally edit
> the upstream `input-text`'s `text` — both are config edits.) I re-run and compare; a follow-up _"now in Korean"_
> is another single-node config tweak. Which field to touch comes from the block's `configSchema`, not
> hardcoded — see FR-7.

**US-6 — Understand a flow (read-only Q&A).**

> I open a flow someone shared and ask _"What does this flow do?"_ The agent reads the graph and each
> block's role and replies with a plain-language walkthrough (input → generation → outputs) — no
> mutation, no run. This works even for a **Viewer**, whose agent has only read tools (FR-15).

**US-7 — Build and run in one prompt.**

> I say _"Build me a flow that generates an image from a caption, then run it."_ The agent builds the
> nodes in its draft — `input-text` → `single-image-generator` → `output-preview`. Its `run_flow`
> call can't fire yet: the targets live only in the un-promoted draft, so the run is **blocked**
> (`not_persisted`) and recorded as a `pendingRunIntent` (FR-13). The turn ends at the **plan gate**;
> I click **Accept**, the plan is promoted, and because a run intent is queued the turn
> **auto-continues** — the recorded run is remapped onto the now-live nodes and presented at the
> **run gate**. I **Confirm**, it runs, and the agent reports the previewed image.
> (See [Build-and-run](workflow-logic.md#build-and-run-in-one-prompt).)

## Edge cases

- **EC-1 Ambiguous request** ("make it better") → agent asks a clarifying question instead of guessing
  (FR-4).
- **EC-2 Unknown block requested** ("add a Slack node") → no matching entry in `blockRegistry`; agent
  states the block doesn't exist and offers the closest available blocks.
- **EC-3 Incompatible connection proposed** → tool-executor/reducer validation rejects the edge
  before it is added to the draft; agent revises or explains (NFR-2).
- **EC-4 Viewer / Anonymous** → mutation/exec tools are absent from the catalog exposed to the model
  for that role; the agent explains it can only read (Viewer) or is unavailable (Anonymous) (FR-15).
- **EC-5 Concurrent edit (owner + own agent)** → the only simultaneous-edit case v1 supports is one
  **Owner editing while their own agent runs** (including their own multi-tab). The draft is forked
  **once** and diverges cleanly, so the owner's live edits during the turn never corrupt the in-flight
  draft; the risk is only at **promote**, where a **content-hash drift check** (at the plan gate, and
  re-checked just before the replay) catches any change the owner made. On drift the agent **does not
  promote** — it notifies me and re-plans against a fresh baseline ("the flow changed while I was
  working — re-plan?") rather than clobbering. Multi-user / co-Editor simultaneous editing is **out of
  scope for v1** (see [Concerns](07-concerns.md#concerns) and
  [Drift](workflow-logic.md#concurrency--drift-owner--agent)).
- **EC-6 Out-of-credits / missing AI key (execution)** → surfaced per FR-19 (charge deep-link); the
  run aborts cleanly. Reasoning-side cost failures surface as a gateway error (NFR-8).
- **EC-7 Long-running backend node** → the agent's loop and the UI don't _freeze_; it reports "running"
  and resolves when the terminal node event arrives (via RunTracker), bounded by the 60 s
  `POLL_TIMEOUT` exactly as the human path does. ("Doesn't freeze" ≠ the user
  can start a second turn — the turn is still single and active until it resolves; see FR-3a / EC-10.)
- **EC-8 Tool loop cap** → the agent stops after a bounded number of tool iterations per user turn and
  reports partial progress rather than looping indefinitely.
- **EC-9 No flow open** → the agent panel is unavailable/disabled until the user opens a flow (FR-6);
  the agent never creates or switches flows on the user's behalf. If the user asks it to "make a new
  flow", it instructs them to open one first rather than doing it itself.
- **EC-10 User sends while a turn is active** → not allowed as a concurrent turn (FR-3a). The user
  either **waits** for the turn to finish or presses **Stop**. Stop cancels the turn via the gateway
  `AbortSignal` **at a safe boundary — between tool steps, never mid-commit** — so no mutation is left
  half-applied. Because mid-turn mutations only touch the headless draft, stopping before promote
  simply discards the draft (nothing was persisted); a completed promote from an earlier turn is
  unaffected, and the transcript records the interruption. While **`awaiting_plan`** the agent is idle:
  the user Accepts/Rejects, and a free-text message there is treated as **reject-and-redirect**
  (steering), not a second turn.

---

Prev: [Requirements](01-requirements.md) · Next: [Architecture & design →](03-architecture.md)
