# Docs reorganization — proposal

> **Status: PROPOSAL — nothing moved yet.** For review. Two goals: (1) make future features **additive** — a
> new feature adds a new doc, it does not rewrite a central spec; (2) split the docs that have grown past
> ~400 lines; and drop the retired-agent pages. Approve the shape (or a phase of it) and I execute, then delete
> this proposal.

---

## 1 · Why

Two pains today:

- **Rewrite, not additive.** The loop, the tool/permission model, and the canvas seam are each described in
  **three** docs at different altitudes — [architecture.md](./architecture.md) (`The turn`, `Interfaces`,
  `ToolExecutor & permissions`, `CanvasBinding — the seam`), [harness-spec.md](./harness-spec.md) (`The loop`,
  `Tools`), and [harness-interfaces.md](./harness-interfaces.md) (`Tools`, `CanvasBinding seam`). So one core
  change edits three files, and a **new agent-kind rewrites all of them** — exactly what happened when the
  builder landed (spec §6/§8, interfaces §4, architecture strategies, agents/README all changed together).
- **Monoliths.** Four docs mix a stable core with feature-specific detail:
  `eval-benchmark.md` (551), `harness-interfaces.md` (493), `architecture.md` (425), `harness-spec.md` (410).

## 2 · The idea — altitude layers, one home each; features are leaves

Split by **altitude**, give each altitude **one** home, and make everything feature-specific a **leaf** that is
added, never merged into the core:

- **Overview** — the map (unchanged in spirit, thinned): at-a-glance, the two strategies, principles, the
  component map, grounding. No interface signatures or loop mechanics.
- **Core** — the parts that rarely change: the think/act loop, the tool + permission model, the canvas seam.
  Changed **only** when a core contract actually changes.
- **Interfaces** — the exact types, split from the prose spec.
- **Agents (leaves)** — one page per agent; already the shape under `agents/`. A new agent = a new page here.
- **Features (leaves)** — one page per cross-cutting capability (sub-agents/spawn, skills, eval). A new
  capability = a new page here.

## 3 · Target structure

```
docs/browser-agent/
  README.md                     # entry map (trimmed)
  CONVENTIONS.md                # NEW — the additive rule (§5 below)
  design/
    overview.md                 # was architecture.md, thinned to map + strategies + principles + grounding
    core/
      loop.md                   # the think/act loop, direct writes, when the turn ends
      tools-and-permissions.md  # tool model, ToolExecutor, capability grants
      canvas-seam.md            # the CanvasBinding contract (merges canvas-binding.md)
    interfaces/
      core.md                   # Agent / BaseAgent / session types
      tools.md                  # ToolProvider / ToolDef / results / catalog types
    features/
      sub-agents.md             # spawn · roster · AgentCard
      skills.md                 # KEEP (already a per-feature leaf)
    eval/
      methodology.md            # the fair-comparison idea, adapter, oracle discipline, protocol, scorecard
      scenarios.md              # the scenario ladder (Tiers 0–5) — ADDITIVE: new scenarios append here
  agents/
    README.md                   # roster + the three kinds + pointer to CONVENTIONS
    blockAgent.md · generator.md · locator.md · edge.md · builder.md
    (node.md, property.md REMOVED — retired agents)
```

## 4 · Where today's sections go

| Current                                                                                      | → New home                                                                     |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| architecture.md `At a glance` / `Two strategies` / `Principles` / `Components` / `Grounding` | `design/overview.md`                                                           |
| architecture.md `The turn` · harness-spec §4/§5/§7                                           | `design/core/loop.md`                                                          |
| architecture.md `ToolExecutor & permissions` · harness-spec §8 (model)                       | `design/core/tools-and-permissions.md`                                         |
| architecture.md `CanvasBinding — the seam` · harness-interfaces §6 · canvas-binding.md       | `design/core/canvas-seam.md`                                                   |
| architecture.md `Interfaces` · harness-interfaces §1/§2/§6                                   | `design/interfaces/core.md`                                                    |
| harness-interfaces §3/§5 (tools, catalog types)                                              | `design/interfaces/tools.md`                                                   |
| harness-spec §6 · harness-interfaces §4 (spawn/Builder-consumer)                             | `design/features/sub-agents.md`                                                |
| harness-spec §8 `Per-agent tool surface`                                                     | moved onto each `agents/<agent>.md` (so a new agent-kind never edits the spec) |
| eval-benchmark §0–§3, §5                                                                     | `design/eval/methodology.md`                                                   |
| eval-benchmark §4 (scenario ladder, Tiers 0–5)                                               | `design/eval/scenarios.md`                                                     |
| agents/node.md, agents/property.md                                                           | **removed** (retired; still linked as "retired" in agents/README)              |

## 5 · The convention (CONVENTIONS.md)

> A **new agent** adds `agents/<name>.md` + a roster line — nothing in `design/core/*`.
> A **new capability** adds `design/features/<name>.md`.
> A **new eval scenario** appends to `design/eval/scenarios.md`.
> Edit a `design/core/*` or `design/interfaces/*` doc **only when a core contract actually changes** (the loop,
> the tool/permission model, the canvas seam, a shared type). The per-agent **tool surface** lives on the agent's
> own page, so adding an agent never rewrites the spec.

## 6 · Suggested phasing (so you can approve a slice)

- **Phase 1 — safe wins (low risk):** remove `node.md` + `property.md`; add `CONVENTIONS.md`; split
  `eval-benchmark.md` → `eval/{methodology,scenarios}.md`. No dedup of the core trio yet.
- **Phase 2 — de-duplicate the core (higher effort):** fold the loop/tools/seam prose into `design/core/*`
  and the types into `design/interfaces/*`; thin `architecture.md` → `overview.md`; retire the overlapping
  sections from `harness-spec.md` / `harness-interfaces.md` (leaving each a thin pointer or removing it).

## 7 · Open questions for review

1. Names: `overview.md` vs keeping `architecture.md`? `core/` + `interfaces/` subfolders, or flat with prefixes
   (`core-loop.md`)?
2. Do `harness-spec.md` / `harness-interfaces.md` get **removed** after their content is redistributed, or kept
   as thin indexes that link into `core/` + `interfaces/`?
3. Approve **all** of §3, or just **Phase 1**?
