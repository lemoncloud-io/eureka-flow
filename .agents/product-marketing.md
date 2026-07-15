# Product Marketing Context

_Last updated: 2026-07-15_
_Draft status: auto-drafted from codebase (eureka-flow README/CONTEXT.md, eureka-flows-api README). Items marked `[TBD]` or `[inference]` need human confirmation._

## Product Overview

**One-liner:** Browser-based visual workflow editor for building and running data/AI pipelines — connect 100+ pre-built blocks and execute them in real time.
**What it does:** Eureka Flow lets users build data processing and AI workflows by dragging blocks onto an infinite canvas and connecting them with typed ports. Flows execute in dual modes (instant frontend blocks + heavy backend computation) with live node-status updates over WebSocket. Backed by the Eureka Flows API (serverless, AWS).
**Product category:** Visual workflow builder / AI pipeline editor (how users search: "visual workflow editor", "no-code AI pipeline", "node-based editor")
**Product type:** SaaS (web app at flow.eureka.codes) by LemonCloud; frontend is Apache 2.0 open source
**Business model:** Credit-based usage for AI blocks — accounts consume Credits when AI blocks run, or a workspace configures its own AI key (Gemini/OpenAI) and runs free of Credits. Credits are purchased in the separate billing app. [TBD: pricing tiers, credit prices]

## Target Audience

**Target companies:** [inference] Teams and individual builders who need data/AI automation without writing pipeline code — startups, internal tooling teams, LemonCloud ecosystem users (Eureka Codes console users)
**Decision-makers:** [TBD] Likely developer/tech leads for workspace adoption; individual builders self-serve
**Primary use case:** Visually composing and executing data → AI → output pipelines without infrastructure setup
**Jobs to be done:**

- Prototype an AI/data pipeline in minutes in the browser, without deploying anything
- Share a working flow with teammates (Workspace) or publicly (Public flow) so others can run it
- Run the same flow with per-user configs (Session overlay) without forking it
  **Use cases:**
- AI content/image generation chains using pre-built AI blocks
- Data transform pipelines mixing instant in-browser blocks with server-side heavy computation
- Publishing a reusable flow that Viewers can run with their own inputs

## Personas

| Persona               | Cares about                              | Challenge                      | Value we promise                                  |
| --------------------- | ---------------------------------------- | ------------------------------ | ------------------------------------------------- |
| Builder (Owner)       | Fast iteration, visual clarity           | Wiring APIs/AI by hand is slow | Drag-drop 100+ blocks, run instantly, auto-save   |
| Teammate (Editor)     | Tweaking configs without breaking things | Shared flows get overwritten   | Session overlay — own configs, original untouched |
| Consumer (Viewer)     | Just running a proven flow               | Can't code, doesn't want to    | Open a Public flow and run it, zero setup         |
| Workspace admin [TBD] | Cost control                             | Unpredictable AI spend         | Own AI key = no credit burn; credits otherwise    |

## Problems & Pain Points

**Core problem:** Building even a simple data/AI pipeline normally requires code, API glue, and infrastructure — too slow for prototyping and out of reach for non-developers.
**Why alternatives fall short:**

- Code-first pipelines (scripts, Lambda glue): slow to iterate, invisible execution state
- [inference] Generic automation tools (Zapier/Make): trigger-action oriented, weak at multi-step AI/data graphs with live execution feedback
- [inference] Self-hosted node editors (n8n, Langflow): require deployment and ops before the first run
  **What it costs them:** Days of setup before the first working pipeline; engineering time spent on glue instead of logic.
  **Emotional tension:** [TBD — capture verbatim from users]

## Competitive Landscape

**Direct:** [inference — confirm] Langflow, Flowise, n8n — node-based flow builders; fall short on instant zero-install start (browser + one-click API key) and live per-node execution status.
**Secondary:** Zapier / Make — automation without graphs; falls short for data-heavy, multi-branch AI pipelines.
**Indirect:** Writing custom scripts / notebooks — full control but no visual model, no sharing/permission model.

## Differentiation

**Key differentiators:**

- 100+ pre-built blocks across input/process/output categories
- Dual execution: instant frontend blocks + backend heavy computation, unified in one canvas
- Real-time WebSocket node status (IDLE → READY → RUNNING → COMPLETED/ERROR)
- Session overlay: Editors run shared flows with personal configs without mutating the original
- One-click API key handoff from Eureka Codes Console (postMessage, no copy-paste)
- Flexible AI billing: own AI key (no credits) or account Credits
  **How we do it differently:** Zero-install browser app on serverless infrastructure; permissions (Owner/Editor/Viewer/Anonymous) and execution are server-authoritative.
  **Why that's better:** First working pipeline in minutes; safe team sharing; predictable AI cost paths.
  **Why customers choose us:** [TBD — capture verbatim]

## Objections

| Objection                                             | Response                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| [TBD] "Is my data safe running through your backend?" | [TBD]                                                              |
| [TBD] "How is this different from n8n/Zapier?"        | Dual-mode execution + live status + session overlay; zero install  |
| [TBD] "What happens when credits run out?"            | Configure your workspace's own AI key — runs stop charging Credits |

**Anti-persona:** [inference] Teams needing on-prem/self-hosted deployment of the full stack; enterprises requiring compliance certifications [TBD].

## Switching Dynamics

**Push:** Pipeline glue code is slow to write and debug; execution state is invisible.
**Pull:** Working visual pipeline in the browser in minutes; live execution feedback; easy sharing.
**Habit:** Existing scripts/notebooks already work; team knows their current tool.
**Anxiety:** [TBD] Vendor lock-in, credit cost predictability, data handling.

## Customer Language

**How they describe the problem:** [TBD — collect verbatim]
**How they describe us:** [TBD — collect verbatim]
**Words to use:** flow, block, canvas, run, Workspace, Owner / Editor / Viewer, Credit, Credit balance, charge (충전 — happens in billing), AI key, own AI key, Public flow, session
**Words to avoid:** (from CONTEXT.md glossary)

- "BYOK" — dev jargon, not user-facing (say "own AI key")
- "API key" unqualified — collides with the flow auth key (qualify: "AI key" vs "flow API key")
- "creator/author" (say Owner), "collaborator/member" (say Editor), "guest" (legacy, say Viewer)
- "organization/team/account" for tenant grouping (say Workspace)
- "draft/fork/copy" (say session), "published/open" (say Public)
  **Glossary:**
  | Term | Meaning |
  |------|---------|
  | Flow | A saved workflow graph of nodes and edges |
  | Block / Node | A pre-built unit of work placed on the canvas |
  | Credit | Account-scoped currency consumed when AI blocks run |
  | Run mode | Server-decided billing path: own AI key (free) vs Credits |
  | Workspace | Tenant grouping; membership grants Editor rights |
  | Session overlay | Per-user config layer over a shared flow |
  | Public flow | Flow viewable/runnable by Viewers and Anonymous visitors |

## Brand Voice

**Tone:** [TBD] Developer-friendly, confident, concise (README style suggests technical-but-approachable)
**Style:** Direct, show-don't-tell (live demo first: "Try it now")
**Personality:** [TBD] capable, fast, open (open-source frontend), pragmatic

## Proof Points

**Metrics:** [TBD] (e.g., blocks count: 100+; time-to-first-flow)
**Customers:** [TBD]
**Testimonials:** [TBD]
**Value themes:**
| Theme | Proof |
|-------|-------|
| Zero-install start | flow.eureka.codes live demo + one-click API key from console |
| Real-time visibility | WebSocket node status streaming |
| Safe team sharing | Server-authoritative permission matrix + session overlay |
| Cost flexibility | Own AI key runs consume no Credits |

## Goals

**Business goal:** [TBD — e.g., grow active workspaces / credit purchases]
**Conversion action:** Visit flow.eureka.codes → create API key via Eureka Codes Console → build & run first flow
**Current metrics:** [TBD]
