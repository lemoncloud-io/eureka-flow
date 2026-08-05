# Local terminal — implementation notes (DELETE AFTER IMPLEMENTATION)

> **Temporary.** The durable design is `local-terminal.md`. This file is the a→b how-to / change note for
> building it and is meant to be **deleted once the terminal ships**. Nothing here is a spec — the spec is
> the design doc; this is the mechanical plan grounded in the current tree (Node v24, esbuild 0.27,
> `tsx`/`ts-node` absent).

---

## Reused vs. new (moved out of the design doc)

The real flow stack is all shipped code; the renderer is the one new-logic component.

| Piece                                   | Source                                                       | Status                                                               |
| --------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| Flow engine                             | `createFlowEngine` / `createFlowWorkspace` (`@flows/engine`) | **reused, unchanged**                                                |
| Canvas binding                          | `createEngineCanvasBinding` (`@flows/agent` `canvas/`)       | **reused, unchanged** — same as the browser                          |
| Block-registry → catalog adapter        | `createBlockCatalogLookup` (today in `apps/web/.../utils`)   | **promote → shared lib** (§2b)                                       |
| Orchestrator + roster + flat loop       | `createOrchestratorAgent` (`agents/orchestratorAgent.ts`)    | **reused, unchanged**                                                |
| Transcript store port                   | `SessionStore` (`session/session.ts`)                        | **reused** — terminal supplies an observable impl                    |
| Gateway (direct Gemini)                 | `createGeminiLlmGateway` (`llm/`)                            | **reused, unchanged**                                                |
| Node ports (for the gateway)            | `createVirtualAgentEnvironment`, `createFetchHttpRequest`    | **reused, unchanged**                                                |
| Gateway-from-env helper                 | `resolveLiveGateway` (today under `__tests__/harness/`)      | **promote → `src/llm/`** (§2a)                                       |
| **Two-pane renderer**                   | `libs/agent/src/cli/`                                        | **★ NEW** — the one component with novel logic                       |
| Driver `TerminalRun`                    | `libs/agent/src/cli/`                                        | new but **thin glue** (mirrors `useAgentSession`)                    |
| Observable `SessionStore`               | `libs/agent/src/cli/`                                        | new but **thin glue** (~20-line lift of the web hook's inline store) |
| Entry + build + `agent:terminal` script | `libs/agent/src/cli/`, root `package.json`, `.env.example`   | new but **thin glue**                                                |

`Graph` in agent code is exactly `WorkflowState` = `{ nodes: NodeData[]; edges: EdgeData[] }`.

## 1 · File plan (all NEW, under `libs/agent/src/cli/` — mirrors `libs/engine/src/cli/`, not barrel-exported)

| File                            | Responsibility (SRP)                                                                                                                                                                                                                                                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli/assembleStack.ts`          | Build the **real stack**: connected → `createFlowWorkspace({ http })` + `repository.loadBlocks()` / `repository.load(flowId)`; offline → `createFlowEngine({ getBlockRegistry: () => stubRegistry })`. Returns `{ engine, binding: createEngineCanvasBinding(engine), catalog: createBlockCatalogLookup(registry), repository? }`. |
| `cli/stubBlocks.ts`             | A small baked block registry for offline mode (lift the `BLOCKS` shape from `libs/engine/src/cli/stubHttpPort.ts`).                                                                                                                                                                                                                |
| `cli/observableSessionStore.ts` | `createObservableSessionStore(onSave): SessionStore` — `load/create/save` over an in-memory `SessionState`; `save` records + calls `onSave`. ~20 lines. (Lift from `useAgentSession.ts:60-74`, minus persistence.)                                                                                                                 |
| `cli/terminalRun.ts`            | `createTerminalRun({ gateway, binding, catalog, userPermissions, … }): TerminalRun` — builds the observable store + `createOrchestratorAgent`, exposes `submit/abort/reset/getGraph/getState/onChange`. `reset(seed)` → `engine.loadGraph(seed ?? empty)`. The Node twin of `useAgentSession`.                                     |
| `cli/render.ts`                 | The two-pane painter: `render(state, graph, opts)`. Pure of agent logic. readline + ANSI + `picocolors`. Swappable for `ink` later.                                                                                                                                                                                                |
| `cli/terminal.ts`               | Entry: parse argv, load env, `assembleStack(...)`, resolve gateway (or `--fake`), `createTerminalRun`, `run.onChange(render)`, readline loop + meta-commands. `main().catch(e => { console.error(e); process.exitCode = 1 })`.                                                                                                     |
| `cli/build.mjs`                 | esbuild JS-API bundler (below). Could also live in repo `scripts/`.                                                                                                                                                                                                                                                                |

Keep `cli/` out of `libs/agent/src/index.ts` — it touches `process` + terminal I/O and must never enter a
browser bundle (same rule the engine CLI follows).

## 2 · The two lib changes (both additive, no behaviour change)

**(a) Promote `resolveLiveGateway`.** Move `resolveLiveGateway`/`liveModel`/`liveProvider` from
`libs/agent/src/__tests__/harness/liveGateway.ts` → `libs/agent/src/llm/resolveLiveGateway.ts`; re-export from
`llm/index.ts`; update the `*.live.spec.ts` importers. It already depends only on public factories +
`process.env`. _Fallback:_ inline the 6-line Gemini build in `terminal.ts` (forks env/retry handling — prefer
the move).

**(b) Promote `createBlockCatalogLookup`.** Move it (and its `toBlockSchema`/`toConfigSchema` helpers) from
`apps/web/.../utils/createBlockCatalogLookup.ts` into a shared lib so the terminal can import it — recommend
`@flows/agent` (it already owns `createCatalogLookup` + `BlockSchema`; `BlockDefinitionWithFrontend` from
`@flows/flows` is a **type-only** import, erased at build). Then:

- update `apps/web/.../utils/index.ts` re-export + the two web import sites (`FlowAgentPanel.tsx`,
  `AgentHarnessPage.tsx`) to import from the lib — a one-line-each swap, no behaviour change;
- **verify no dependency cycle** (`@flows/flows` must not import `@flows/agent` at runtime; type-only is safe).
  _Fallback:_ the terminal re-derives the tiny registry→schema mapping locally — but that duplicates a mapping
  that MUST match the browser's (select→`enum`, numeric→`number`), so prefer the move.

## 3 · Assembling the real stack (`cli/assembleStack.ts`)

Mirror `apps/web/.../FlowAgentPanel.tsx` (engine + binding + catalog from one registry):

```ts
// CONNECTED (full browser parity) — needs FLOW_API_URL (+ FLOW_API_KEY)
import { createFetchHttpPort } from '@flows/engine'; // engine's HTTP port (+ createApiKeyAuth)
const http = createFetchHttpPort({ baseUrl: FLOW_API_URL, auth: createApiKeyAuth(FLOW_API_KEY ?? null) });
const { engine, repository } = createFlowWorkspace({ http });
await repository.load(flowId); // GET blocks + flow (or loadBlocks() only, empty graph)
const binding = createEngineCanvasBinding(engine);
const catalog = createBlockCatalogLookup(repository.blockRegistry());

// OFFLINE (no backend) — real engine, stub registry
const engine = createFlowEngine({ getBlockRegistry: () => STUB_REGISTRY });
engine.loadGraph(seed ?? { nodes: [], edges: [] });
const binding = createEngineCanvasBinding(engine);
const catalog = createBlockCatalogLookup(STUB_REGISTRY);
```

Selection: `--connect` or presence of `FLOW_API_URL` → connected; else offline. `FLOW_API_URL` defaults to the
existing `VITE_API_URL` in `.env.local` if unset. `/save` → connected: `repository.save()`; offline: write
`engine.getGraph()` to a file.

**How the agent discovers blocks (grounding for the renderer/verification).** The catalog is never dumped into
the prompt — it reaches the model as the `catalog_search(query)` tool (each hit is a full `BlockSchema`: type,
label, ports for wiring, config fields incl. select-enums; an **empty query returns the whole catalog** —
`catalog.ts`), plus `describe_node(nodeId)` for a node already on the canvas. Create/config tools validate
against the catalog (`has`/`schema`). So the injected registry _is_ the buildable set: the real backend set
when connected, the stub set offline.

## 4 · esbuild build (`cli/build.mjs`) — the load-bearing bits

The esbuild **CLI** can't express a plugin, and the bundle needs (a) a `.md?raw` loader and (b) tsconfig-path
resolution (`@flows/engine`, `@flows/flows`) — so use the JS API:

```js
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

const mdRaw = {
    // Vite's `import x from './foo.md?raw'` is not a Node/esbuild feature — inline as text
    name: 'md-raw',
    setup(b) {
        b.onResolve({ filter: /\.md\?raw$/ }, a => ({ path: a.path.replace(/\?raw$/, ''), namespace: 'md-raw' }));
        b.onLoad({ filter: /.*/, namespace: 'md-raw' }, async a => ({
            contents: await readFile(a.path, 'utf8'),
            loader: 'text',
        }));
    },
};

await build({
    entryPoints: ['libs/agent/src/cli/terminal.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile: 'dist/agent-cli/terminal.mjs',
    tsconfig: 'tsconfig.base.json', // resolves @flows/engine (source), @flows/flows via `paths`
    plugins: [mdRaw],
});
```

Note: pulling the engine binding now bundles `@flows/engine` **source** via `paths` — this is why `tsconfig:`
is mandatory (the `node_modules/@flows` symlink omits `engine`).

## 5 · Run wiring

Root `package.json`:

```jsonc
"agent:terminal": "node libs/agent/src/cli/build.mjs && node --env-file=.env.local dist/agent-cli/terminal.mjs"
```

`--env-file=.env.local` (native in Node 24) loads `GEMINI_API_KEY` (model) and, for connected mode,
`FLOW_API_URL` / `FLOW_API_KEY` (blocks + flows backend) into `process.env` before assembly. Args after `--`
pass through: `yarn agent:terminal -- --connect --flow <id> --verbose`, or `yarn agent:terminal -- --fake`.

## 6 · ESM / runtime gotchas the build must respect (all verified)

1. **`.md?raw`** — `skills/skills.ts` imports playbooks this way; the `mdRaw` plugin inlines the two
   `src/skills/playbooks/*.md`. Without it the bundle throws.
2. **`@flows/*` paths** — `@flows/engine`/`@flows/flows` resolve to source **only** via `tsconfig.base.json`
   `paths`. `tsconfig:` is mandatory.
3. **`@lemoncloud/eureka-flows-api` is types-only** — no runtime entry; every import from it must stay
   `import type` (a value import compiles but breaks at runtime).
4. **No web build** — the entry pulls only `@flows/agent` → `@flows/engine`/`@flows/flows` source + Node
   built-ins; never `@flows/web-core`. esbuild skips typecheck, so the red web-core typecheck can't block this.

## 7 · `.env.example` additions

Append (currently the file lists only `VITE_*`):

```sh
# --- Flow-agent terminal ---
# Model (direct-to-Gemini; the one piece the browser proxies through the backend):
GEMINI_API_KEY=          # required for a live run; from Google AI Studio
# GEMINI_MODEL=gemini-2.5-flash
# LLM_RETRY_ATTEMPTS=4
# LLM_RETRY_BASE_MS=1000
# Connected mode (real blocks + flows, full browser parity) — defaults FLOW_API_URL to VITE_API_URL:
# FLOW_API_URL=
# FLOW_API_KEY=          # dev-stage token; put the real value ONLY in .env.local (gitignored), never here
```

## 8 · UI library decision (renderer only — driver is agnostic)

|               | v1 · zero-dep (recommended)                                   | v2 · ink                                     |
| ------------- | ------------------------------------------------------------- | -------------------------------------------- |
| Deps          | none (`node:readline/promises`, ANSI, installed `picocolors`) | add `ink` (React 19 already in node_modules) |
| Split pane    | manual two-column redraw on `onChange`                        | `<Box flexDirection="row">` free             |
| Indep. scroll | scroll-tail + `/graph` dump                                   | built-in                                     |
| Fit           | good — `onChange` cadence is per-op, redraw is cheap          | overkill for v1                              |

Ship **v1 zero-dep**; `render.ts` is swappable, so `ink` is a later drop-in behind the same `render(state,
graph)` call. Confirm before coding if ink is preferred from the start.

## 9 · Verification (definition of done)

Manual (`--fake` = no model spend; offline stub registry unless `--connect`):

| #   | Input                                    | Oracle                                                                                                                       |
| --- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| V1  | launch, no `GEMINI_API_KEY`, no `--fake` | prints env contract, exits non-zero                                                                                          |
| V2  | `--fake`, any line                       | scripted reply + graph mutation render; **zero** model calls                                                                 |
| V3  | `add a text input node`                  | left pane gains a node whose `config` is **engine-seeded defaults** (not `{}`) — proves the real binding                     |
| V4  | then `add a preview and connect them`    | second node + an edge; multi-turn transcript intact                                                                          |
| V5  | `move that node right 40px`              | `position.x` up, `y` unchanged (smoke-test locator path)                                                                     |
| V6  | impossible ask (wire a cycle)            | error/refusal line; **graph unchanged** — the **engine** rejects the connect (EngineError → tool error), not just the tool   |
| V7  | `/reset` then `/graph`                   | `{nodes:[],edges:[]}`                                                                                                        |
| V8  | Ctrl-C mid-turn                          | `abort()` fires; applied edits remain; prompt returns                                                                        |
| V9  | `--connect --flow <id>`                  | left pane shows the **real** loaded flow; blocks come from `GET /blocks/0/list`; `catalog_search` returns the real block set |

Automated backstop (the real definition of done for logic): a vitest spec drives `createTerminalRun` with
`createFakeGateway` over an offline engine stack, asserting `onChange` emits the expected `(state, graph)`
sequence for V3–V7. Covers the driver without a terminal or a network. Live smokes (opt-in): a direct-Gemini
offline run for V3–V6, and a connected run for V9.

## 10 · Suggested order

1. `observableSessionStore.ts` + unit test.
2. Promote `resolveLiveGateway` (§2a) + fix spec imports; `nx test @flows/agent` green.
3. Promote `createBlockCatalogLookup` (§2b) + fix web imports; `nx test @flows/agent` + web build green.
4. `stubBlocks.ts` + `assembleStack.ts` (offline path first) + unit test.
5. `terminalRun.ts` + the vitest backstop (§9) with a fake gateway over the offline stack.
6. `render.ts` (zero-dep) + `terminal.ts` entry + meta-commands.
7. `build.mjs`, `package.json` script, `.env.example` (§5, §7).
8. Manual V1–V8 offline; wire connected mode; V9 against the dev backend.
9. **Delete this file.**
