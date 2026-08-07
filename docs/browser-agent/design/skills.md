# Skills — progressively-disclosed playbooks

> **What this is.** The in-process port of **Claude Code Agent Skills**: named, described units of
> **instructions** a capable agent loads **on demand**. A skill is inert data + a `use_skill` tool — NOT a
> bundle of tool providers. Its consumer — the composition **Builder** agent — **shipped alongside it**
> ([builderAgent.ts](../../../libs/agent/src/agents/builderAgent.ts), registered `type: 'builder'`), wiring
> `createUseSkillToolProvider(SEED_SKILLS)`; design in [builder.md](../agents/builder.md).
>
> **Grounding.** Built on the shipped `@flows/agent` (`libs/agent/src`): the `BaseAgent` loop, the
> `ToolProvider`/`ToolExecutor` seam, and `LlmGateway`. The **Builder** — the flow's structural writer in the
> shipped [hybrid](./architecture.md#the-hybrid-writer-layer) — is the one consumer; the other agents
> (orchestrator, block agents, generator) **do not use skills** — they list their tool values via `toolset`.
> Last updated 2026-08-05.

---

## 1 · Why a skill is not a tool bundle

An earlier iteration modelled a skill as `{ name, description, createTools() }` — a build-time bundle of tool
providers wired into an agent at construction. That is **not** an Agent Skill: it has no instructions body, its
`name`/`description` are read by nothing, and everything it carries is always in context. It was removed.

A **Claude Code Agent Skill** is defined by **progressive disclosure** (source: `code.claude.com/docs/en/skills`):

| Level            | What                               | When it enters context                        | Cost         |
| ---------------- | ---------------------------------- | --------------------------------------------- | ------------ |
| **1 · Metadata** | the skill's `name` + `description` | **always** — a cheap index                    | ~a line each |
| **2 · Body**     | the full **instructions**          | **on demand**, only when the skill is invoked | the payload  |

The **`description` is the router**: the model matches the task against it to decide whether to load the skill,
then follows the loaded **instructions** in place of its default approach. The value is context economy (you
never pay for a playbook you aren't using), composability (an agent can stack several), and maintainability
(domain know-how lives in versioned data, not a monster prompt).

## 2 · The in-process realization

We keep **both** halves of the Claude Code shape — the SKILL.md **authoring format** and the progressive-
disclosure **mechanism**. The only thing we drop is the _runtime filesystem read_ (the agent runs headless /
in-browser): skills are authored as `.md` files but **bundled at build time**, and the metadata index + the
on-demand body are realized through **one `use_skill` tool**.

**Authoring — skills are Markdown files, not code.** Each skill is a `.md` under
`libs/agent/src/skills/playbooks/<name>.md` in the SKILL.md shape: `---`-fenced frontmatter (`name`,
`description`) then the instructions body. Bodies are **content, kept out of code** — versionable, diff-friendly,
editable without touching TypeScript. They are inlined at build via Vite's `?raw` import (typed by
`raw-md.d.ts`) and parsed by `parseSkill` into the inert `Skill` value below. Adding a playbook is dropping a
new `.md` file — no code change beyond parsing it.

```ts
// libs/agent/src/skills/skill.ts — the parsed skill: inert data, no tools, no deps.
interface Skill {
    name: string; // selection + dispatch key (the use_skill argument)
    description: string; // LEVEL 1 — always in context; states WHAT + WHEN (the trigger the model matches)
    instructions: string; // LEVEL 2 — the playbook, loaded ON DEMAND via use_skill(name); never in context until then
}

// libs/agent/src/skills/parseSkill.ts — SKILL.md source → Skill (frontmatter → name/description, body → instructions).
declare function parseSkill(markdown: string): Skill; // fails loud on missing fence / missing key / empty body

// libs/agent/src/skills/skillProvider.ts — the mechanism, as a normal ToolProvider.
declare function createUseSkillToolProvider(skills: Skill[]): ToolProvider;
//   use_skill's DESCRIPTION embeds the index (one `- name: description` line per skill) — Level 1, always sent
//     to the model because tool defs go every turn; its `name` param is an enum of the skill names.
//   use_skill({ name }) → { name, instructions }   — Level 2, the body enters the transcript on demand.
//   an unknown name → a plain tool error; the provider validates non-empty instructions + unique names at build.
```

**Why files, not in-code strings.** Instructions are authored prose; keeping them as `.md` content (the
Agent Skills standard) rather than string literals in a `.ts` file keeps know-how separate from the agent core
and readable/versionable on its own. The `Skill` + `use_skill` seam is stable, so the _source_ of skills can
evolve — in-code → build-time `.md` files (here) → a server / registry fetch at scale — with no change to the
provider or any consumer.

**Progressive disclosure rides the existing loop for free.** `BaseAgent.send()` re-lists tools and re-sends
them every iteration, and feeds each tool result back — so the index is always present, and an invoked skill's
`instructions` arrive as a tool-result message on the next iteration. No change to `BaseAgent`, `ToolExecutor`,
`ToolProvider`, or `LlmGateway`: `createUseSkillToolProvider` is an ordinary provider an agent lists in its
`AgentConfig.tools`.

## 3 · Seed skills

Instructions-first playbooks under `skills/playbooks/*.md` (know-how, no tools of their own — the consuming
agent already holds the tools):

| Skill                   | Body carries                                                                                                                                                                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build-linear-pipeline` | the input → process… → output chain: add in dependency order, wire adjacent stages, lay out left-to-right                                                                                                                                                       |
| `configure-generator`   | the generator's model↔provider-key map + sampling params + system-vs-user prompt (the same know-how as the generator specialist's `SINGLE_OUTPUT_GENERATOR_SYSTEM_PROMPT`, re-authored as a loadable Builder playbook — the const still drives the specialist) |

`configure-generator` shows the direction: a named specialist's **configuration** know-how carved into a
loadable skill the Builder can pull — "fewer, more capable agents, each built from many skills" — while the
generator specialist still stands with its own inline prompt.

## 4 · Explicitly deferred

Faithful to the Claude Code essence while avoiding speculation — added only when something needs them:

- **Tool-activation (`allowed-tools`).** A skill unlocking tools on load is an advanced Claude Code feature; the
  Builder carries its tools directly, so skills stay knowledge-only here. Add a tool-activation surface only
  when a skill genuinely needs to widen what's callable.
- **User `/name` invocation, filesystem SKILL.md, dynamic preprocessing / `$ARGUMENTS`, fork/subagent
  execution** — all Claude Code features not needed for the in-process, model-invoked foundation.

## 5 · How we verify

Deterministic, headless, at the parse + provider + loop layers:

- **Authoring parse** — `parseSkill` reads frontmatter `name`/`description` + the Markdown body, keeps a `:` in
  a description (first-colon split), and fails loud on a missing fence / missing key / empty body.
- **Index is cheap + complete** — `use_skill`'s tool description contains every skill's name + description and
  **no** `instructions` body.
- **On-demand body** — `use_skill({ name })` returns that skill's `instructions`; an unknown name errors; a
  duplicate name / empty instructions is rejected at construction (fail loud).
- **Progressive disclosure end-to-end** — an agent carrying only `use_skill` sends the index every turn but the
  body is **absent** until it calls `use_skill`, then **present** the next iteration (asserted on the recorded
  gateway requests).
- **Description-driven selection** is a model judgement — only a live model proves it, so the `RUN_LIVE`
  scenario lands **with the Builder**
  ([builder.live.spec.ts](../../../libs/agent/src/__tests__/harness/scenarios/builder.live.spec.ts)), not here.
