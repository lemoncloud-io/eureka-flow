# Changelog

## [2026-08-07] - root@0.67.0, @flows/web@0.67.0, @flows/admin@0.41.0

### Features

- (agent) ship the hybrid writer layer; retire the fan-out A/B
- (agent) local terminal to drive the flow-agent headless
- (agent) pull the graph via get_graph — the Approach-3 context variant
- (agent) live canvas to the tail — cacheable transcript, ~halves builder cost
- (agent) checkpoint — builder+skills, two-prompt orchestrator, catalog fold, eval harness
- (agent) correctness-only eval-benchmark comparing the two roster designs
- (agent) on-demand skill playbooks + the Builder that composes them
- (agent) block-oriented agents composed from skills
- (agent) structural node & edge specialist agents over the live canvas

### Bug Fixes

- (agent) run agent:terminal without a .env.local
- (agent) align agent prompts and tool descriptions with the shipped design
- (agent) group parallel tool results into one user content (both Gemini APIs)
- (agent) reroute at the right altitude; orchestrator/builder own destruction correctly
- (agent) builder finishes multi-node builds; orchestrator routes + reroutes correctly
- (agent) fail loudly on unknown id and skip the empty-patch transaction

### Documentation

- (agent) doc↔code accuracy pass for PR + local-terminal diagrams
- (agent) terminal-vs-web architecture diagram
- (agent) design + impl-notes for the local terminal

### Refactor

- (engine) one edge-validation rule, owned by the engine
- (agent) compose agent tools from self-named tool values
- (agent) rename is the builder's, added at build time
- (agent) rename generator specialist → single-output-generator
- (agent) agents complete completable requests; refuse only the impossible
- (agent) orchestrator composes canvas read from the inspect skill
- (agent) orchestrator delegates intent; specialists own schema validation

### Chores

- keep bench-runs/ + manifest prettierignore rules local-only
- (agent) reconcile branch WIP — prompts, docs, tests; un-churn manifests
- (agent) wip edge reject-occupied-input

### Other

- test: (agent) consolidate live scenarios into integration.live; retire the eval-benchmark A/B
- test: (agent) enforce that every write tool declares its capability
- test: (agent) gate live Gemini specs behind RUN_LIVE

## [2026-07-30] - root@0.66.2, @flows/web@0.66.2, @flows/admin@0.40.2

### Bug Fixes

- (engine) 가드가 재로드를 모르는 것과, ERROR 프레임이 error 를 지우는 것
- (engine) 모르는 state가 노드를 지우거나 늦은 프레임이 되돌리지 않게

### Documentation

- (engine) §15 참조 오타와 과한 단정 하나
- (engine) state 갭의 결정을 기록한다 — PLAN §16, types.ts, GUIDE 양쪽
- (engine) 모바일 행을 §5에 나눠 적는다 — 리듀서를 안 탄다
- (engine) 와이어는 SKIPPED를 안 싣는다 — 슬라이스 0 판정
- (engine) the state model as it is, and a plan for the gap

## [2026-07-30] - root@0.66.1, @flows/web@0.66.1, @flows/admin@0.40.1

### Documentation

- (agent) retitle the canvas-binding index entry to match the doc
- (agent) drop the last two pre-engine claims from the browser-agent docs
- (agent) point the in-memory binding's note at the engine binding

### Refactor

- (agent) bind the canvas seam to the engine, not the desktop canvas ref

## [2026-07-29] - root@0.66.0, @flows/web@0.66.0, @flows/admin@0.40.0

### Features

- (mobile) route every mobile graph write through the engine
- (mobile) load the mobile editor's graph through the engine, so port values arrive
- (engine) publish the engine as @lemoncloud/flow-engine, ESM and CJS from one source
- (engine) let the host supply the UUID source, so the engine reaches every runtime
- (engine) the repository keeps what the load response says about the flow
- (engine) carry the connection id, so a headless run can be streamed back
- (engine) connect the socket adapter in --real, and stop it writing by default
- (engine) headless execution — frame parser, run session, runNode (Phase 4)
- (engine) socket port and the execution state reducer (Phase 3, in-repo half)
- (engine) persistence ports and the headless Node proof (Phase 2)
- (engine) implement the FlowEngine core (Phase 1, P1-1)

### Bug Fixes

- (engine) export the socket port, and read the agent's canvas from the engine
- (engine) report a run against the node, and keep the status on a non-JSON error body
- (mobile) merge the port map instead of replacing it on a socket port update
- (mobile) stop the empty-state quick-add offering the same block twice
- (engine) give adapters a barrel, and stop pointing at a function the package doesn't ship
- (engine) run the published package before calling it published
- (engine) build request URLs without URL, which React Native cannot be trusted for
- (engine) the block registry was keyed on a field the server never sends
- (engine) a run reset names the node, and the run session carries it out
- (flows) a connected input takes what its source is producing now
- (engine) settle the waiters a closing session drops, and stop copying the whole graph
- (web) typecheck reaches zero
- (web) carry the graph's guarantees into the components
- (libs) every library now emits declarations
- (build) align lib tsconfigs with the workspace, clearing two known defects
- (flows) read getWorkflow from the engine, not the render closure

### Documentation

- (engine) point the README guide link back at develop
- (engine) pin the README guide link to a resolvable commit
- reconcile the engine and agent docs with what the merge actually did
- (engine) document the edit/runtime split and the load ingress
- retract the "mobile has no engine" notes — it does now
- (engine) tell consumers the two things that will otherwise cost them an afternoon
- say that the mobile editor is not on the engine
- (engine) name the published specifier where a reader outside the repo will copy it
- (engine) record the three places this landed differently from the plan
- (engine) say what the package actually installs, and link a branch that has the guide
- (engine) the browser smoke ran, and it showed the load ingress working
- (engine) close the two ports that were deferred and then forgotten
- (readme) put the engine on the dependency diagram
- the store is a projection, not the graph's home
- (engine) add a one-page map of where the graph lives
- (engine) record that the channelId wire was removed, and what it was doing
- (engine) correct the channelId finding — it was never a server contract issue
- (engine) unbreak the section numbering, and record Phases 5-6 in the checklist
- (engine) correct the half-adopted claim — the rules were already shared
- (engine) record Phase 6 — what the real server found that the stub hid
- (engine) retitle PLAN for Phase 0-5
- (engine) record Phase 5 — three rule slices, and what stays gated
- (engine) record the stale-input defect, with its reproduction
- (engine) retitle PLAN for Phase 0-2 and note Phase 3 is unspecified
- (engine) add flow engine design doc and phase 0-1 execution plan

### Refactor

- (flows) drop the channelId wire, and name the default channel where it is used
- (flows) the load response port row is the engine's, plus what the client adds
- (engine) loadGraph is the single ingress, ports and propagation included
- (engine) decode the HTTP node view where the socket one is decoded
- (flows) drop the override nobody passed, and share the hydrator
- (engine) let the engine's types and rules have one home each
- (graph) the graph guarantees its nodes have ids
- (socket) test the dispatch path, and restore a guard the strangler dropped
- (flows) hand the canvas graph to the engine (Phase 1, P1-2/P1-3)
- (engine) extract headless graph core into @flows/engine (Phase 0)

### Chores

- (merge) develop into mobile-engine
- (merge) develop into mobile-engine
- ignore npm pack tarballs

### Other

- ci: (engine) publish on develop merge, gated on the version being new
- ci: (engine) add a publish workflow, and declare the tools prepack was borrowing
- test: (engine) cover the request timeout, the last untested platform global
- style: (socket) group the parsed frame payloads with the messages they come from

## [2026-07-29] - root@0.65.0, @flows/web@0.65.0, @flows/admin@0.39.0

### Features

- (agent) orchestrator harness — one main agent + spawned specialists over the live canvas

### Refactor

- (agent) scope branch to the feature — revert unrelated churn vs develop

## [2026-07-29] - root@0.64.0, @flows/web@0.64.0, @flows/admin@0.38.0

### Features

- (agent) add Generate API LlmGateway adapter foundation
- (agent) wire BrowserAgentEnvironment into AgentPanel flow
- (agent) add capability metadata to llm gateway contract
- (agent) locator agent — @flows/agent core + flow-editor panel
- (agent) add environment self-check for storage and trace
- (agent) add llm gateway with gemini 2.5 flash provider
- (agent) add http request port with fetch and scripted implementations
- (flows) add CanvasBinding + dev validation panel
- (agent) add browser/virtual environment foundation

### Bug Fixes

- (agent) gate FlowAgentPanel behind import.meta.env.DEV
- (agent) address PR review — checkpoint agent moves, store-sourced reads, role-derived grant
- (agent) redact api key from provider error bodies

### Documentation

- (agent) reconcile browser-agent docs with the store-sourced code
- (agent) drop stale spec/section/milestone citations from comments
- (agent) clarify Capability is a deliberate standalone mirror
- (agent) refine architecture diagrams and reconcile docs with code
- (agent) reconcile llm gateway brief with shared contract
- (agent) drop W04 tag from gemini model comment
- (agent) trim locator IMPLEMENTATION, add at-a-glance diagram
- (agent) move browser agent briefs to docs root
- (agent) locator agent spec + implementation record
- (agent) soften browser verification wording in W04 brief
- (agent) add W04 llm gateway brief
- (agent-chat) redesign around agent-owns-turn + single ToolExecutor
- (agent-chat) reconcile diagrams and section numbering
- (agent-chat) rewrite spec as SPEC.md + README.md, archive prior iterations
- (agent-chat) reorganize component interfaces top-down and reconcile spec
- (agent) clarify reactive useAgentStore vs StorageInterface persistence port
- (agent) polish meeting brief for review
- (agent) add spec-driven development specs for agent chat feature
- (agent) add acceptance criteria to meeting brief

### Refactor

- (agent) align @flows/agent with repo conventions, dedupe types, trim comments
- (flows) make AgentPanel presentational; containers own the agent
- (flows) extract agent wiring into a FlowAgentPanel adaptor
- (agent) refit gemini gateway onto shared chat contract
- (agent) extract generic BaseAgent + useAgentSession for multi-agent reuse
- (flows) rename makeDesktopCanvasBinding → createDesktopCanvasBinding

### Chores

- (agent) clean internal verification wording
- (agent) prune redundant tests, relocate web specs, tighten docs
- (agent) centralize lib tests + reorganize browser-agent docs
- drop manual libs/agent reference from root tsconfig (nx sync)
- (agent) verify environment build compatibility

### Other

- test: (agent) verify fake gateway tool call through tool executor
- test: (agent) prove both storages share one contract

## [2026-07-21] - root@0.63.0, @flows/web@0.63.0, @flows/admin@0.37.0

### Features

- (apps) relative time, New badge, search/sort, and a11y on the gallery
- (apps) make /apps a public gallery on the SEO list endpoint

### Refactor

- (apps) apply /simplify cleanups + extract useInfiniteScrollObserver

## [2026-07-21] - root@0.62.0, @flows/web@0.62.0, @flows/admin@0.36.0

### Features

- (admin) give name its own language key
- (admin) edit select options and suggest existing keys
- (admin) let the editor set the config placeholder and its key
- (admin) carry and edit the *En language keys
- (i18n) add translateField resolver for *En language-key fields
- (admin) redesign UI as a dataflow instrument panel
- (admin) extend block migration to port/config labels
- (i18n) seed port/config field keys in blocks.json
- (admin) add dev-only block label→key migration tool
- (i18n) seed blocks.json with label/description translations
- (admin) enable block update (full CRUD, assuming server remote update)
- (admin) wire block editor to server API (list + create)
- (i18n) translate server block text via language keys at render time

### Bug Fixes

- (admin) stop saving a block from clearing its required ports
- (i18n) fall back to an identifier when a label resolves to nothing
- (admin) align sidebar wire through node marker centers

### Refactor

- mount the key suggestion list once, and finish the label fallbacks
- (admin) make an empty placeholder mean one thing
- (i18n) correct the centralization claim and drop a magic indent
- (admin) tidy the key dictionary hook after review
- (i18n) drop the label-as-key resolver and its migration tool
- (i18n) read mobile editor block text through translateField
- (i18n) read desktop editor block text through translateField
- (i18n) replace S3/presign storage with repo files + JSON export/import
- (i18n) consolidate supported languages into one constant

### Other

- style: (admin) shrink inner-page table type and unify row density
- style: (admin) drop background grid, tighten spacing

## [2026-07-20] - root@0.61.0, @flows/web@0.61.0, @flows/admin@0.35.0

### Features

- (flows) add dev graph panel to inspect and round-trip the JSON graph
- (flows) keep the working copy across a refresh
- (flows) save before running, and stop runs a save cannot rescue
- (flows) start flows locally and track saves against a baseline
- (flows) add the workspace baseline and diff
- (flows) generate node and edge IDs on the client
- (flows) add headless canvas store factory

### Bug Fixes

- (mobile) stop nesting buttons inside the step card
- (mobile) destructure the onRun prop MobileStepDetail already declares
- (flows) surface a failed blocks fetch as the boot error

### Documentation

- (flows) correct the boot-join comment — settled, not surfaced
- (plan) record boot parallelization done, staged-render B/C deferred
- (plan) defer S8 staged loading with rationale
- (plan) record the DEV smoke results
- (plan) record what S7 recon overturned
- (plan) prove the run surface rather than assert it
- (plan) mark D-C retired where it was decided
- (plan) record S6 and retire D-C
- (plan) fold the S5 wiring check into the pre-ship DEV smoke
- (plan) record S5 and re-aim D-C at the slice that can carry it
- (plan) pin the baseline provenance questions S5 has to answer
- (plan) record the run regression S3 opens
- (plan) record S2 browser smoke results

### Refactor

- refactor code
- (flows) save and run without the confirm prompt
- (flows) auto-restore the draft silently with an undo instead of prompting
- (flows) offer draft recovery as a non-blocking toast, not a modal confirm
- (flows) make dev graph panel import/export file-based
- (flows) remove dead canvas engine/history/layout hooks
- (flows) let the run gate hand back the id it mints
- (flows) drop the draft timestamp nobody reads
- (flows) source the desktop canvas graph from the store

### Chores

- (docs) move local-json-graph working docs out of the repo

### Other

- perf: (flows) fetch blocks and flow in parallel during boot
- test: (flows) cover the save body and the store's write notifications

## [2026-07-16] - root@0.60.0, @flows/web@0.60.0, @flows/admin@0.34.0

### Features

- (apps) enable apps list route only in dev mode
- (flows) render upload-html product output as a link card
- (flows) block file uploads over 58 MB
- (apps) open an App in the same tab via a relative /apps/:id href
- (apps) add empty and error states to the apps list
- (apps) add /apps route listing the workspace's deployed AI Studio apps

## [2026-07-10] - root@0.59.0, @flows/web@0.59.0

### Features

- (flows) skip node upserts for rename and position when Auto Save is off

## [2026-07-08] - root@0.58.0, @flows/web@0.58.0, @flows/admin@0.33.0

### Features

- (shared) show workspace & project in ApiKeyDialog

## [2026-07-07] - root@0.57.0, @flows/web@0.57.0, @flows/admin@0.32.0

### Features

- (socket) apply lemon-model progress envelopes
- (socket) consume lemon-model progress/logtrace over flow socket

### Chores

- (deps) add lemon-model

## [2026-07-02] - root@0.56.0, @flows/web@0.56.0, @flows/admin@0.31.3

### Features

- (web) show 404 page on unmatched routes

### Bug Fixes

- (flows) stop temp node IDs leaking into flow save
- (flows) allow node selection for viewer role

## [2026-06-25] - root@0.55.3, @flows/web@0.55.3, @flows/admin@0.31.2

### Bug Fixes

- (ui) correct credit change color

## [2026-06-25] - root@0.55.2, @flows/web@0.55.2, @flows/admin@0.31.1

### Bug Fixes

- (web-core) stop false API-key clear on large flow payloads

## [2026-06-24] - root@0.55.1, @flows/web@0.55.1

### Bug Fixes

- (canvas) default node position on load to stop undefined '.x' crash
- (flows) clear canvas on New for viewer role

## [2026-06-23] - root@0.55.0, @flows/web@0.55.0, @flows/admin@0.31.0

### Features

- (dev) replace floating DevRoleToggle with inline header DevRoleChip
- (permissions) allow editor role to modify canvas (add/delete/connect blocks)
- (flows) show AI key warning banner on LOCAL only
- (flows) add read-only RunModeIndicator (own key vs credits)
- (permissions) consume server v0.26.618 hasOwned/isEditable + useApiKey

### Bug Fixes

- (dev) use ● / ✗ for permission indicators in DevRoleChip tooltip
- (dev) use circle symbols for permission indicators in DevRoleChip tooltip
- (i18n) clarify DevRoleChip permission tooltip labels in ko/en
- (i18n) add missing translations for DevRoleChip and header keys
- (permissions) replace owner-only guards with canModifyCanvas in mobile + DetailPanel
- (a11y) role=img on RoleIndicator + BillingChip popover skeleton + credit aria-label
- (flows) stop infinite re-render loop on flow run (React #185)
- (socket) route WS run echo via hex connection id + guard propagate loop

### Documentation

- update permission model — split canvas edit from flow metadata, add matrix + ADR amendment

### Refactor

- (dev) make DevRoleChip draggable floating widget
- (flows) consolidate header billing + role into BillingChip and RoleIndicator

### Other

- revert: (socket) drop frontend hex connection id + misdiagnosed #185 guards

## [2026-06-18] - root@0.54.1, @flows/web@0.54.1, @flows/admin@0.30.1

### Bug Fixes

- (permissions) rename isOwner -> hasOwned to match server /load contract
- (flows) detect node_/edge_ temp IDs to prevent 404 on node save

## [2026-06-17] - root@0.54.0, @flows/web@0.54.0, @flows/admin@0.30.0

### Features

- (permissions) model 4 flow roles, fix owner-only 403 for editors
- (models) add LLM model selector with expected credit cost
- (credits) refresh balance after a flow run
- (credits) credit chip variants for mobile + navigator headers
- (credits) figma popover redesign + left-header placement
- (credits) unify credit control + brand coin glyph
- (credits) filter tabs, pagination, richer usage rows
- (credits) in-app credit balance + usage history (A1)
- (billing) add credit-charge deep-link button to editor

### Bug Fixes

- (credits) cap balance/transactions retries, stop request storm

### Documentation

- (i18n) clarify VITE_I18N_BUCKET_URL must end with stage prefix
- (billing) use placeholder billing URL for open-source

### Refactor

- (billing) harden useBillingCharge per review

### Chores

- remove stray figma-login-check.png from repo root

### Other

- test: (credits) prove retry cap; stop refetch on reconnect

## [2026-05-27] - root@0.53.2, @flows/web@0.53.2, @flows/admin@0.29.2

### Bug Fixes

- (flows) preserve node config in saveCurrentFlow body

## [2026-05-27] - root@0.53.1, @flows/web@0.53.1

### Bug Fixes

- (mobile) node add persistence, delete UX, dropdown bubbling, i18n

## [2026-05-27] - root@0.53.0, @flows/web@0.53.0

### Features

- (mobile) polish node detail with new-badge wiring, multi-conn add row, i18n
- (mobile) apply mobile UX fixes from 2026-05-21 spec

### Bug Fixes

- (mobile) clear prior new-badge timeout when marking the same connection again
- (mobile) keep dropdown open during 2-stage node delete confirm

### Refactor

- (mobile) extract renderPortGroup and tighten connection-mode comments

## [2026-05-26] - root@0.52.2, @flows/web@0.52.2, @flows/admin@0.29.1

### Chores

- (deps) drop unused docx and lodash

## [2026-05-26] - root@0.52.1, @flows/web@0.52.1

### Bug Fixes

- (mobile) import isOAuthEnabled used in public-mode sign-in CTA

## [2026-05-26] - root@0.52.0, @flows/web@0.52.0, @flows/admin@0.29.0

### Features

- (process) align write-side field names with server schema

### Bug Fixes

- (api) handle 401 and expose runNode setting param

### Refactor

- (api) simplify adapter recursion and runNode query params

## [2026-05-22] - root@0.51.0, @flows/web@0.51.0, @flows/admin@0.28.0

### Features

- (socket) stream product progress to banner, mobile toast, and node chip
- (navigator) restore MVP polish — memo edit, progress card, mark-as-done

### Bug Fixes

- (tools) persist flow connection in urlTemplate

### Refactor

- (navigator) deduplicate actor filter and memoize stage panel
- (navigator) revert UX to flow-navigator-mvp spec

## [2026-05-19] - root@0.50.0, @flows/web@0.50.0

### Features

- enable real process API in CI deployments

## [2026-05-19] - root@0.49.0, @flows/web@0.49.0, @flows/admin@0.27.0

### Features

- (process) add loading indicators and success messages
- show actor/tool assignment indicators on stage template items
- improve actor card with stereo icons and current ring
- polish tools page, process cards, and item row indicators
- replace prev/next nav with horizontal stage stepper
- replace tool type dropdown with icon radio cards
- note author display and tool opened feedback
- process apply with item name prompt and list shortcut
- polish stage completion info and actor color dots
- add reopen, skip, and completion state UX improvements
- show navigator button on dev server (VITE_ENV=DEV)
- support zip file upload in image input block
- improve tool action UX and embed browser
- stage detail and actor page UX improvements
- ux batch — hydration, delete item, notes fix, cleanup
- items page UX improvements and stage hydration
- optimistic UI for all process navigator mutations
- implement realApi proxy client and remove Dashboard
- navigator UX improvements — actor filtering, item filters, stage warnings
- (flows) add navigator feature
- enhance navigator with type-aware UI improvements
- improve dashboard
- improve ui
- implement phase8
- implement phase7
- implement phase6
- implement phase5
- implement phase4
- implement phase3
- implement phase2
- implement phase1

### Bug Fixes

- increase stage card vertical padding
- prevent crash from empty SelectItem value in tool form
- auto-fetch all flow pages in tool form dropdown
- pass flowRef on tool creation, not just update
- expand sidebar setup section by default
- route task/note mutations through stages.update for real API
- share actor selection across components via Zustand store
- cache update correctness in optimistic mutations
- use sentinel value for empty SelectItem in stage editor
- only call useItem on /items/* routes in header breadcrumb
- use entity-specific proxy path (/:type/:id/proxy) instead of /flows/
- default to mockApi, switch to realApi only with VITE_PROCESS_API=real
- improve navigator UX with contextual header and stage navigation
- improve navigator accessibility and dashboard UX

### Refactor

- (process) remove unused hydration
- remove server-unsupported UI features
- simplify review — fix hydration, memo, dedup
- replace invalidateQueries with direct cache updates
- improve navigator UI with design review fixes
- use ui-kit Breadcrumb components and extract helpers
- (process) simplify incomplete task tracking

### Chores

- resolve merge conflicts with origin/develop
- add type dependency

### Other

- revert: restore landing page to original state

## [2026-05-18] - root@0.48.0, @flows/web@0.48.0

### Features

- (mobile) add "new" connection badge and output result preview
- (mobile) replace window.confirm with 2-stage inline confirm buttons
- (mobile) add flow settings menu items and error state to connection cards
- (mobile) add image upload to new flow sheet and content preview to connection targets
- (mobile) convert connection sheet to fullscreen slide-in page
- (mobile) expand icon opens ContentPreviewModal overlay
- (mobile) add image thumbnails, error banners, waiting state to cards
- (mobile) rewrite MobileStepCard to match Figma vertical card layout
- (mobile) upgrade connection sheet and new flow sheet
- (mobile) fix Figma gaps — rich cards, breadcrumbs, Korean labels
- (mobile) redesign mobile editor UI to match Figma TO-BE

### Bug Fixes

- (mobile) revert stereo left border and restore group container
- (mobile) match empty state card layout and add stereo left border
- (mobile) align UI with Figma design spec
- (mobile) support desktop=1 query param to force PC view
- (mobile) add missing i18n keys for flow settings, pc version, confirm messages
- (mobile) remove chevron from available cards, add toggle expand to connected cards
- (mobile) fix available card layout — separate row content from chevron
- (mobile) add checkmark to connected cards and chevron to available cards
- (mobile) fix run button icon size (w-4.5 invalid) and darken background
- (mobile) reduce oversized text and buttons for mobile viewport
- (mobile) match header to Figma — no back arrow, larger name, round play
- (mobile) enlarge expand button touch target to 44px minimum
- (mobile) revert quick-add cards to row layout matching Figma
- (mobile) change IMG badge color to purple to match Figma
- (mobile) enlarge card image preview and add resolution/IMG badge
- (mobile) show content preview for all block types in step cards
- (mobile) show config.text in step card content preview
- (mobile) align with Figma TO-BE and add i18n keys

### Refactor

- (mobile) remove AI slop patterns from mobile editor UI

## [2026-05-14] - root@0.47.0, @flows/web@0.47.0, @flows/admin@0.26.0

### Features

- implement multiple api keys

## [2026-05-14] - root@0.46.1, @flows/web@0.46.1

### Bug Fixes

- (auth) adjust page height and enable scrolling

## [2026-05-13] - root@0.46.0, @flows/web@0.46.0

### Features

- add i18n to tutorial

### Chores

- (ci) add OAuth env vars to force-deploy workflow

## [2026-05-13] - root@0.45.1, @flows/web@0.45.1

### Bug Fixes

- (auth) clear lemon-web-core credentials after API key creation

## [2026-05-13] - root@0.45.0, @flows/web@0.45.0, @flows/admin@0.25.0

### Features

- (auth) polish login, key dialog, and completion screen UI
- (auth) add i18n translations and dark mode support
- (auth) implement Figma design for login, key creation, and key success pages
- (auth) add OAuth login and API key creation flow

### Bug Fixes

- (shared) replace Codes popup button with OAuth login redirect
- (auth) skip login redirect when API key already exists

### Refactor

- refactor code

### Other

- style: (auth) polish KeyCreation and KeySuccess pages to match Figma

## [2026-05-07] - root@0.44.0, @flows/web@0.44.0, @flows/admin@0.24.0

### Features

- (ui) add new play icons for buttons

## [2026-05-06] - root@0.43.0, @flows/web@0.43.0, @flows/admin@0.23.0

### Features

- update viewport logic

## [2026-04-30] - root@0.42.0, @flows/web@0.42.0, @flows/admin@0.22.0

### Features

- add public badge to flow list
- (flows) add flow forbidden error handling
- add dark mode and loading animation
- (i18n) add bundled fallback for translations

### Bug Fixes

- (ui) hide root element
- (permissions) clarify guest role permissions
- (ui) improve flow creation button visibility

### Refactor

- (apikey) simplify apiKey initialization
- improve permission denied error handling
- (ui) simplify theme styling

## [2026-04-28] - root@0.41.1, @flows/web@0.41.1, @flows/admin@0.21.1

### Refactor

- update VersionUpdateBanner styling

### Chores

- remove open graph metadata

## [2026-04-24] - root@0.41.0, @flows/web@0.41.0, @flows/admin@0.21.0

### Features

- add connection parameter to runFlow API

## [2026-04-23] - root@0.40.0, @flows/web@0.40.0

### Features

- add SEO metadata to tutorial and public flows pages

## [2026-04-23] - root@0.39.0, @flows/web@0.39.0

### Features

- add seo metadata and translations

## [2026-04-23] - root@0.38.1, @flows/web@0.38.1

### Refactor

- relocate public mode sign-in banner

## [2026-04-23] - root@0.38.0, @flows/web@0.38.0

### Features

- update editor design

## [2026-04-23] - root@0.37.0, @flows/web@0.37.0

### Features

- update landing page

### Refactor

- (ui) simplify and optimize code structure

## [2026-04-21] - root@0.36.0, @flows/web@0.36.0

### Features

- add compact mode to DevSocketPanel

## [2026-04-21] - root@0.35.0, @flows/web@0.35.0

### Features

- update DevSocketPanel

## [2026-04-21] - root@0.34.0, @flows/web@0.34.0, @flows/admin@0.20.0

### Features

- update debug mode
- add AI key warning and dialog
- add api key popup
- add get profile api

## [2026-04-21] - root@0.33.0, @flows/web@0.33.0, @flows/admin@0.19.0

### Features

- add new translations and update existing ones
- add graph view translation
- update socket dev
- add double click event to ports

### Bug Fixes

- reset node state on runId change

### Refactor

- improve port data handling
- improve socket recorder and node replay logic
- improve port update handling

## [2026-04-20] - root@0.32.1, @flows/web@0.32.1

### Bug Fixes

- handle initial flow id

## [2026-04-20] - root@0.32.0, @flows/web@0.32.0, @flows/admin@0.18.0

### Features

- (permissions) enforce role-based UI gating across desktop and mobile editors

## [2026-04-17] - root@0.31.1, @flows/admin@0.17.1

### Bug Fixes

- (i18n) load translations immediately after locale discovery

## [2026-04-17] - root@0.31.0, @flows/web@0.31.0, @flows/admin@0.17.0

### Features

- enable CORS for translation uploads
- (i18n) add API key auth support for presign API requests
- (i18n) add presigned URL upload, dynamic locale discovery, and security hardening
- (i18n) add live sync for translation edits

### Bug Fixes

- (i18n) use URLSearchParams for presign API query encoding
- (i18n) rename presign auth header to x-i18n-key

### Chores

- update S3 bucket to eureka-flows-i18n and add presign env vars to CI

## [2026-04-16] - root@0.30.1, @flows/web@0.30.1

### Chores

- update theme color and add SEO meta tags

## [2026-04-16] - root@0.30.0, @flows/web@0.30.0, @flows/admin@0.16.0

### Features

- update theme
- add interactive guide tour with step change handling
- updat meta and public flow page
- improve thumbnail capture
- add view-only badge, run-all auto-scroll, and quick-add blocks
- add search functionality in mobile editor
- add localization for mobile editor flows
- show occupied port info and replace connect button
- improve mobile-editor ui/ux

### Bug Fixes

- remove unimplemented fitView shortcut from help dialog
- open sidebar when block tutorial starts in editor

### Refactor

- remove examples tab from help dialog, fix FlowMosaic naming
- align block tutorial icons with sidebar emoji icons
- consolidate tutorial menu items from 3 to 2
- redesign sidebar to 2-column card grid and remove unused interactive tutorial
- simplify FrontendBadge component
- unify loading spinners to consistent w-8 border-2 pattern
- simplify loading indicators
- refactor landing
- improve flow card styling and layout
- encode path segments in api requests
- simplify step navigation logic
- update group container styles
- refactor mobile-editor

## [2026-04-15] - root@0.29.0, @flows/web@0.29.0

### Features

- improve tutorial ui/ux
- implement custom guided tour and block tutorial

### Refactor

- improve tutorial flow and steps

## [2026-04-14] - root@0.28.1, @flows/web@0.28.1

### Other

- perf: eliminate canvas re-renders on zoom/pan

## [2026-04-14] - root@0.28.0, @flows/web@0.28.0, @flows/admin@0.15.0

### Features

- add dev role toggle and animations
- update mobile-editor
- add isEditable flag
- support 3-tier setting
- add run all functionality
- add canvas context menu for block selection
- enhance port data retrieval with options
- add node block context menu

### Bug Fixes

- sync pending updates during node execution

### Refactor

- enhance toaster styling
- refactor code
- remove import functionality from header
- replace MoreVertical button with styled div

### Chores

- update error styling
- update button colors for run options

## [2026-04-13] - root@0.27.0, @flows/web@0.27.0, @flows/admin@0.14.0

### Features

- add live trace indicator and run history panel
- remove dnd
- improve mobile UI/UX

### Refactor

- improve visual recognition and styling

### Chores

- resolve merge conflict with develop

## [2026-04-13] - root@0.26.0, @flows/web@0.26.0, @flows/admin@0.13.0

### Features

- add execution stack (RunContext) UI for tracking node run history

### Refactor

- improve run history handling

## [2026-04-13] - root@0.25.0, @flows/web@0.25.0, @flows/admin@0.12.0

### Features

- migrate socket event types and fix WebSocket message processing

## [2026-04-10] - root@0.24.0, @flows/web@0.24.0, @flows/admin@0.11.0

### Features

- add S3 bucket URL for i18n translations
- add node info card and navigation
- enhance FlowGraphView with role colors
- (flows) add custom graph themes and layout switcher
- integrate reagraph

### Refactor

- unify floating bottom toolbar

## [2026-04-10] - root@0.23.0, @flows/web@0.23.0, @flows/admin@0.10.0

### Features

- update mobile page
- support i18n management
- update tutorial, mobile editor
- add mobile editor

### Refactor

- refactor code
- update connection mode to use upsertFlow
- update route paths and add read-only mode

### Chores

- remove images
- temp commit
- temp commit

## [2026-04-09] - root@0.22.1, @flows/web@0.22.1, @flows/admin@0.9.1

### Refactor

- extract driver config and improve tour steps
- refactor code
- remove guided tour feature

## [2026-04-09] - root@0.22.0, @flows/web@0.22.0, @flows/admin@0.9.0

### Features

- add tutorial

### Refactor

- (ui) remove demo mode and enhance API key dialog
- update API endpoint

### Chores

- temp commit

## [2026-04-07] - root@0.21.0, @flows/web@0.21.0, @flows/admin@0.8.0

### Features

- update guided tour
- add guided tour

### Refactor

- simplify codes url handling

## [2026-04-06] - root@0.20.0, @flows/web@0.20.0

### Features

- (flows) add auto-capture canvas as default thumbnail

### Refactor

- extract formatRelativeTime to utils

## [2026-04-03] - root@0.19.0, @flows/web@0.19.0, @flows/admin@0.7.0

### Features

- add error handling for thumbnail upload
- add query for listing public flows
- add thumbnail upload feature
- upload flow thumbnail
- add thumbnail processing and error handling

### Chores

- remove unused camera icon from FlowCard

## [2026-04-03] - root@0.18.0, @flows/web@0.18.0, @flows/admin@0.6.0

### Features

- update tools of admin
- add published status indicator
- add publish and unpublish functionalities
- update ui for explore
- implement share and public
- add BlockIcon for node state display
- (flows) improve run button functionality and sanitize SVG icons
- add run buttons for process nodes
- add run options for node execution
- add BlockIcon component for icons

### Bug Fixes

- correct propagate query param

### Refactor

- (flows) temporarily disable thumbnail functionality
- (api) update flow metadata endpoint
- rename publishTitle to flowName and update references
- extract StatusIcon component
- remove LogModal and related actions
- (flows) remove node disabled state

### Chores

- update landing
- temp commit
- update button icon size for consistency

## [2026-04-01] - root@0.17.0, @flows/web@0.17.0, @flows/admin@0.5.0

### Features

- add PNG export and fix collapse/expand all functionality

## [2026-03-31] - root@0.16.0, @flows/web@0.16.0

### Features

- update landing page

## [2026-03-31] - root@0.15.0, @flows/web@0.15.0, @flows/admin@0.4.0

### Features

- add node collapse/expand and redesign empty state guide
- add toast, map

### Bug Fixes

- freeze minimap bounds during drag to prevent feedback loop
- clamp minimap click position to prevent viewport overshoot
- use square minimap size to prevent elongated aspect ratio
- improve minimap UI proportions and visual quality
- correct collapsed node port Y offset for edge alignment
- use useLocation instead of window.location in EmptyStateGuide
- hide Browse Examples button on examples page

### Refactor

- derive COLLAPSED_PORT_Y from CSS_TOP + PORT_WRAPPER_HEIGHT/2

### Other

- test: add useCanvasStore collapse/expand unit tests

## [2026-03-30] - root@0.14.2, @flows/web@0.14.2, @flows/admin@0.3.2

### Refactor

- improve trace log handling

### Chores

- update stage visualization colors and label width

## [2026-03-27] - root@0.14.1, @flows/web@0.14.1, @flows/admin@0.3.1

### Refactor

- introduce error field for server-side error messages
- make trace entry properties optional

## [2026-03-27] - root@0.14.0, @flows/web@0.14.0, @flows/admin@0.3.0

### Features

- enhance agent block trace log display
- add agent trace log visualization

### Refactor

- simplify message id parsing

### Chores

- clarify trace message requirements

## [2026-03-26] - root@0.13.0, @flows/web@0.13.0, @flows/admin@0.2.0

### Features

- add skills, tools, blocks feature

### Refactor

- simplify form data types
- update button sizes and colors

## [2026-03-26] - root@0.12.0, @flows/web@0.12.0, @flows/admin@0.1.0

### Features

- setup admin and load flow list
- add copy functionality to content preview

### Bug Fixes

- prevent negative total count
- handle API failure and clear sequence numbers
- require API key before initializing flow editor
- simplify deploy script and env loading

### Refactor

- optimize json parsing

### Other

- ci: improve deploy script configuration

## [2026-03-25] - root@0.11.0, @flows/web@0.11.0

### Features

- update README and landing page

## [2026-03-25] - root@0.10.0, @flows/web@0.10.0

### Features

- add policy feature

## [2026-03-24] - root@0.9.0, @flows/web@0.9.0

### Features

- add landing page

## [2026-03-23] - root@0.8.0, @flows/web@0.8.0

### Features

- add retry and reset API key functionality

### Bug Fixes

- correct env variable precedence logic

## [2026-03-20] - root@0.7.0, @flows/web@0.7.0

### Features

- add fallback polling for node state
- add connectionId params to run api
- add support for text files
- add onWheel event to stop propagation
- support text type
- add port style classes for connection lines
- (flows) add auto-hide duration badge and improve auth error handling
- (flows) enhance error handling in flow editor

### Refactor

- optimize node execution by skipping unchanged config
- improve execution stats handling for terminal states
- optimize state update logic

### Chores

- update license from MIT to Apache-2.0

## [2026-03-18] - root@0.6.2, @flows/web@0.6.1

### Bug Fixes

- opt shortcut
- run w/ config

## [2026-03-12] - root@0.6.0, @flows/web@0.6.0

### Features

- (api) add dynamic API endpoint

### Documentation

- update README with new demo image
- update README and add LICENSE file

### Chores

- add issue templates and contributing guidelines
- (ci) update github actions and environment variables

### Other

- ci: add local deployment configuration

## [2026-03-12] - root@0.5.0, @flows/web@0.5.0

### Features

- clean git history

## [2026-03-10] - root@0.4.1, @flows/web@0.4.1

### Refactor

- simplify auth error handling

## [2026-03-10] - root@0.4.0, @flows/web@0.4.0

### Features

- add beta label to header
- add touch support for port connections and node interactions
- add image processing with config
- add support for loading workflow with missing port data

### Bug Fixes

- (ui-kit) prevent wheel event propagation

### Refactor

- simplify port data application and propagation
- extract port hit detection logic
- (api) simplify error handling logic
- add flowId check to handleNodeUpdate and handlePortUpdate
- optimize port update handling
- simplify node and port update handling

## [2026-03-06] - root@0.3.0, @flows/web@0.3.0

### Features

- add image editing functionality
- add node resizing functionality
- add separator config type
- update socket no logic
- add image copy to clipboard functionality
- improve content preview modal UI and feedback
- add JSON parsing and viewer for content preview
- add expand functionality and enhance tooltip rendering
- add content preview modal
- remove local fallback logic and enhance description display with markdown viewer
- (auth) add forbidden error handling and update dependencies

### Bug Fixes

- (auth) handle API key and permission errors

### Refactor

- migrate image editor to react-image-crop
- improve DebugLogVisualization component
- extract tooltip content rendering into reusable component
- simplify content preview modal and markdown viewer
- simplify getVisiblePorts logic
- (flows) improve description tooltip handling
- (api) remove handleAuthError and improve auth error handling

## [2026-03-05] - root@0.2.0, @flows/web@0.2.0

### Features

- add demo pages

## [2026-03-04] - root@0.1.0, @flows/web@0.1.0

### Features

- support mobile screen

## [2026-03-03] - No version updates

### Features

- (header) add menu groups and reorganize dropdown menu
- (ui) add version info to header dropdown

All notable changes to this project will be documented in this file.
