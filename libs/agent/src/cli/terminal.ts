import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as readline from 'node:readline';

import pc from 'picocolors';

import { assembleStack } from './assembleStack';
import { composeFrame } from './render';
import { resolveAgentModelConfig } from './resolveAgentModelConfig';
import { createTerminalRun } from './terminalRun';
import { createWireLog } from './wireLog';
import { agentModelResolver, createModelGatewayFor } from '../agents/modelGatewayFor';
import { DEFAULT_REGISTRATIONS, ORCHESTRATOR_MODEL_TIER } from '../agents/registrations';
import { createAgentRoster } from '../agents/roster';
import { assertKnownModels, withModels } from '../agents/withModels';
import { liveModel, liveProvider, resolveLiveGateway } from '../llm/resolveLiveGateway';
import { createAgentTrace, renderProjections } from '../trace';
import { errorMessage } from '../utils/errors';

import type { AgentRoster } from '../agents/roster';
import type { Graph } from '../canvas';
import type { LlmGateway as LlmGatewayType } from '../llm/llmGateway';
import type { Chunk, LlmGateway } from '../llm/llmGateway';
import type { SessionState } from '../session/session';

/**
 * Entry for `agent:terminal`: assemble the real engine stack, resolve a direct-Gemini gateway from env (or a
 * fake), drive it through {@link createTerminalRun}, and paint a two-pane alt-screen (left = live canvas JSON,
 * right = the chat). The only file here that touches `process`/the terminal — never bundled for the browser.
 */

const argv = process.argv.slice(2);
const hasFlag = (name: string): boolean => argv.includes(name);
const flagValue = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
};

const ENV_CONTRACT = [
    pc.bold('agent:terminal needs a Gemini key to run live.'),
    'Add it to .env.local (gitignored):',
    '  GEMINI_API_KEY=...            # from Google AI Studio',
    '  # GEMINI_MODEL=gemini-2.5-flash',
    'Connected mode (real blocks + flows) also reads FLOW_API_URL and FLOW_API_KEY.',
    '',
    'Or run with --fake to develop the UI without a model.',
].join('\n');

/** A model-free gateway: always replies `reply`, never calls tools (UI dev, no spend). */
const makeFakeGateway = (reply: string): LlmGateway => ({
    capabilities: { toolCalls: true },
    chat: (): AsyncIterable<Chunk> =>
        (async function* () {
            yield { text: reply };
            yield { done: true };
        })(),
});

const FAKE_REPLY =
    '[--fake] No model wired — I can read the canvas but not build. Set GEMINI_API_KEY (or drop --fake) to build for real.';

const HELP =
    'scroll ‹scroll› pane: mouse wheel / ↑↓ / PgUp PgDn / /top /bottom · /pane switch canvas⇄chat · /save (backend, or <f> local) /graph /seed <f> /reset /verbose /provider /keys /log /trace /quit · Ctrl-C aborts';
const SCROLL_HINT = 'scroll the ‹scroll› pane: mouse wheel or ↑/↓ · /pane switches · /help';

const main = async (): Promise<void> => {
    const fake = hasFlag('--fake');
    const offline = hasFlag('--offline');
    let verbose = hasFlag('--verbose');
    const connected = !offline && !!process.env.FLOW_API_URL;
    const loadFlowId = flagValue('--flow');
    const seedFile = flagValue('--seed');
    // Persist the built flow to the backend after each completed turn (connected mode only); `--no-autosave` opts out.
    const autosave = connected && !hasFlag('--no-autosave');

    // Per-agent model config from AGENT_MODEL_* env (live only). `--model` overrides the reasoning
    // model (the orchestrator's, which the builder inherits); other agents come from the config.
    const modelConfig = fake
        ? { deploymentModels: {}, defaultModel: undefined, reasoningModel: undefined }
        : resolveAgentModelConfig();
    const reasoningModel = flagValue('--model') ?? modelConfig.reasoningModel;

    // Gateway: direct Gemini from env, or the fake for UI dev. No credential and no --fake ⇒ print + exit.
    const rawGateway = fake ? makeFakeGateway(FAKE_REPLY) : resolveLiveGateway({ model: reasoningModel });
    if (!rawGateway) {
        console.error(ENV_CONTRACT);
        process.exitCode = 1;
        return;
    }
    // Fail fast on a typo'd reasoning model (from --model or AGENT_MODEL_REASONING) with a clear
    // startup error naming known ids — not a provider 404 mid-turn. Ungated: this must run even when
    // no other AGENT_MODEL_* config is set. (Building rawGateway above does no network, so this is
    // still before any request.)
    if (!fake && reasoningModel) assertKnownModels([reasoningModel]);

    // Wire log (on by default): records the chat transcript, canvas edits, model token usage, and every
    // flow-API request/response. The file is truncated each run. `--no-log` disables; `--log <file>` sets the path.
    const logPathArg = flagValue('--log');
    const logPath = logPathArg && !logPathArg.startsWith('--') ? logPathArg : 'agent-terminal.log';
    const wire = hasFlag('--no-log') ? null : createWireLog(resolve(logPath));
    wire?.note(
        `session start — mode=${connected ? 'connected' : 'offline'} gateway=${fake ? 'fake' : `${liveProvider()}/${liveModel()}`}`
    );

    const gateway = wire ? wire.gateway(rawGateway) : rawGateway;

    // Per-agent model routing (live + when AGENT_MODEL_* config is present): a roster stamped with
    // named-specialist models + a memoized gatewayFor that builds a wire-logged gateway per model.
    // With no config the common path is byte-identical to before — every agent shares `gateway`.
    const hasPerAgentConfig =
        !fake && (Object.keys(modelConfig.deploymentModels).length > 0 || !!modelConfig.defaultModel);
    let roster: AgentRoster | undefined;
    let gatewayFor: ((agentType: string) => LlmGatewayType) | undefined;
    let modelFor: ((agentType: string) => string | undefined) | undefined;
    if (hasPerAgentConfig) {
        if (modelConfig.defaultModel) assertKnownModels([modelConfig.defaultModel]);
        roster = createAgentRoster(withModels(DEFAULT_REGISTRATIONS, modelConfig.deploymentModels));
        const buildChildGateway = (model: string): LlmGatewayType => {
            const g = resolveLiveGateway({ model });
            if (!g) throw new Error('resolveLiveGateway returned no gateway (missing GEMINI_API_KEY?)');
            return wire ? wire.gateway(g) : g;
        };
        // The builder (reasoning tier) is exempt from defaultModel → inherits the orchestrator gateway.
        // The same resolver drives both the gateway routing and the per-child trace `gen_ai.request.model`.
        modelFor = agentModelResolver(
            roster,
            modelConfig.deploymentModels,
            modelConfig.defaultModel,
            ORCHESTRATOR_MODEL_TIER
        );
        gatewayFor = createModelGatewayFor({
            modelForType: modelFor,
            defaultGateway: gateway,
            gatewayFactory: buildChildGateway,
        });
    }

    // The real flow stack — same as the browser's FlowAgentPanel (engine + binding + catalog).
    const stack = await assembleStack({
        connected,
        baseUrl: process.env.FLOW_API_URL,
        apiKey: process.env.FLOW_API_KEY ?? null,
        flowId: loadFlowId,
        wrapHttp: wire?.httpPort,
    });
    // Wrap the ONE canvas binding all agents share, so node/edge edits show up in the log.
    const binding = wire ? wire.binding(stack.binding) : stack.binding;
    if (seedFile) stack.engine.loadGraph(JSON.parse(readFileSync(seedFile, 'utf8')) as Graph);

    // Structured trace (off by default): --trace or AGENT_TRACE captures the run; `/trace` and exit write the
    // three projections (the same views the eval harness renders). `--trace <file>` overrides the path.
    const traceOn = hasFlag('--trace') || !!process.env.AGENT_TRACE;
    const traceFileArg = flagValue('--trace');
    const tracePath = traceFileArg && !traceFileArg.startsWith('--') ? traceFileArg : 'agent-terminal.trace.log';
    const trace = createAgentTrace(traceOn);
    const writeTrace = (): string | null => {
        if (!traceOn) return null;
        writeFileSync(resolve(tracePath), `${renderProjections(trace.project())}\n`);
        return tracePath;
    };

    const run = createTerminalRun({
        gateway,
        binding,
        catalog: stack.catalog,
        userPermissions: { canModifyCanvas: true, canEditConfig: true },
        loadGraph: graph => stack.engine.loadGraph(graph),
        tracer: trace.tracer,
        ...(reasoningModel ? { model: reasoningModel } : {}),
        ...(roster ? { roster } : {}),
        ...(gatewayFor ? { gatewayFor } : {}),
        ...(modelFor ? { modelFor } : {}),
    });
    if (wire) run.onChange(state => wire.chat(state)); // stream the transcript into the log as chat turns

    // Persist the graph to the backend: one POST /flows/:id/save — the server upserts nodes+edges by client id,
    // so a fresh flow is created and its minted id returned. Mirrors the web's save button.
    const persist = async (): Promise<string> => {
        const { flowId, structureDropped } = await stack.repository.save();
        return structureDropped
            ? `saved settings only — added/deleted steps need owner access (flow ${flowId})`
            : `saved → flow ${flowId}`;
    };

    // Export the current graph to a local JSON file; returns the node count for the caller's notice.
    const writeGraphFile = (file: string): number => {
        const graph = run.getGraph();
        writeFileSync(file, JSON.stringify(graph, null, 2));
        return graph.nodes.length;
    };

    // One-shot (no TUI): drive a single objective, print the reply + resulting graph, exit. Scriptable, and
    // the path the live smoke uses.
    const once = flagValue('--once');
    if (once !== undefined) {
        await run.submit(once);
        const state = run.getState();
        if (state?.phase === 'error') {
            // A failed turn leaves no final assistant message; surface the error and fail the exit code so a
            // script (or the live smoke) can tell. The graph is still dumped below as a diagnostic.
            process.stderr.write(`\n[turn failed: ${state.error ?? 'unknown error'}]\n`);
            process.exitCode = 1;
        } else {
            process.stdout.write(`${state?.messages.at(-1)?.content ?? '(no reply)'}\n\n`);
        }
        process.stdout.write(`${JSON.stringify(run.getGraph(), null, 2)}\n`);
        if (autosave && state?.phase === 'done') {
            try {
                process.stdout.write(`\n[${await persist()}]\n`);
            } catch (err) {
                process.stdout.write(`\n[save failed: ${errorMessage(err)}]\n`);
            }
        }
        wire?.note('once complete');
        if (wire) process.stdout.write(`\n[wire log → ${wire.path}]\n`);
        const tracedOnce = writeTrace();
        if (tracedOnce) process.stdout.write(`[trace projections → ${tracedOnce}]\n`);
        return;
    }

    // ── paint loop ────────────────────────────────────────────────────────────────────────
    const out = process.stdout;
    let lastState: SessionState | null = run.getState();
    let lastGraph: Graph = run.getGraph();
    // shown until the first turn/command
    let notice = [
        wire ? `backend log → ${logPath}` : '',
        traceOn ? `trace on → /trace writes ${tracePath}` : '',
        SCROLL_HINT,
    ]
        .filter(Boolean)
        .join(' · ');
    let busy = false;
    let userAborted = false; // Ctrl-C during a turn — BaseAgent still collapses it to phase 'done', so we track it here
    let leftScroll = 0; // lines scrolled up from the bottom in each pane (0 = live tail)
    let rightScroll = 0;
    let scrollTarget: 'chat' | 'canvas' = 'canvas'; // which pane the scroll keys/commands drive
    let showKeys = false; // /keys diagnostic: echo each keypress name into the header

    const scrollPage = (): number => Math.max(1, (out.rows ?? 24) - 5);
    const scrollActive = (deltaLines: number): void => {
        if (scrollTarget === 'chat') rightScroll = Math.max(0, rightScroll + deltaLines);
        else leftScroll = Math.max(0, leftScroll + deltaLines);
    };
    const scrollTop = (): void => {
        // paint() clamps to the real max
        if (scrollTarget === 'chat') rightScroll = 1e9;
        else leftScroll = 1e9;
    };
    const scrollBottom = (): void => {
        if (scrollTarget === 'chat') rightScroll = 0;
        else leftScroll = 0;
    };

    // historySize 0 frees the ↑/↓ keys for scrolling — which is also how the VS Code / xterm.js terminal
    // delivers the MOUSE WHEEL to a full-screen app (alternate-scroll maps the wheel to arrow keys).
    const rl = readline.createInterface({ input: process.stdin, output: out, prompt: pc.cyan('› '), historySize: 0 });

    const paint = (): void => {
        const columns = out.columns ?? 80;
        const rows = out.rows ?? 24;
        const composed = composeFrame(lastState, lastGraph, {
            columns,
            rows,
            verbose,
            notice: notice || undefined,
            leftScroll,
            rightScroll,
            activePane: scrollTarget,
        });
        leftScroll = composed.leftScroll; // store back the clamped offsets
        rightScroll = composed.rightScroll;
        out.write('\x1b[H\x1b[2J'); // home + clear
        out.write(composed.frame);
        out.write('\n');
        rl.prompt(true); // redraw the input line + current buffer at the bottom
    };

    // Save to the backend, showing progress + outcome in the chat header.
    const saveAndPaint = async (): Promise<void> => {
        notice = 'saving…';
        paint();
        try {
            notice = await persist();
        } catch (err) {
            notice = `save failed: ${errorMessage(err)}`;
        }
        paint();
    };

    run.onChange((state, graph) => {
        lastState = state;
        lastGraph = graph;
        notice = ''; // a real turn supersedes any transient notice
        paint();
    });
    out.on('resize', paint);

    // PageUp/PageDown scroll the ACTIVE pane (`/pane` switches it). These are keys readline ignores, so line
    // editing is unaffected — but some terminals grab PageUp for their own scrollback, so `/top` `/bottom`
    // jump to the ends by typed command (those always reach the app). A new objective snaps to tail.
    readline.emitKeypressEvents(process.stdin, rl);
    if (process.stdin.isTTY) {
        try {
            process.stdin.setRawMode(true); // belt-and-braces; readline usually sets this already
        } catch {
            /* not a raw-capable TTY — /top /bottom still work by typed command */
        }
    }
    process.stdin.on('keypress', (_s: string | undefined, key: readline.Key | undefined) => {
        if (!key || !process.stdin.isTTY) return;
        if (showKeys) {
            const mods = `${key.shift ? '+shift' : ''}${key.ctrl ? '+ctrl' : ''}${key.meta ? '+meta' : ''}`;
            notice = `key: ${key.name ?? JSON.stringify(_s) ?? '?'}${mods}`;
            paint();
        }
        switch (key.name) {
            case 'pageup':
                scrollActive(scrollPage());
                paint();
                break;
            case 'pagedown':
                scrollActive(-scrollPage());
                paint();
                break;
            case 'up': // also the mouse wheel in VS Code / xterm.js (alternate-scroll → arrow keys)
                scrollActive(3);
                paint();
                break;
            case 'down':
                scrollActive(-3);
                paint();
                break;
        }
    });

    // Alt screen (restored on exit) + alternate-scroll mode (?1007h) so the terminal maps the mouse wheel to
    // arrow keys for this full-screen app.
    out.write('\x1b[?1049h\x1b[?1007h');
    let quitting = false;
    const quit = (code = 0): void => {
        if (quitting) return;
        quitting = true;
        wire?.note('session end');
        out.write('\x1b[?1007l\x1b[?1049l'); // leave alternate-scroll + alt screen
        const tracedTo = writeTrace();
        if (tracedTo) out.write(`\n[trace projections → ${tracedTo}]\n`);
        rl.close();
        process.exit(code);
    };
    rl.on('close', () => quit()); // Ctrl-D / stdin EOF

    // ── meta commands (handled locally, never sent to the agent) ─────────────────────────────
    const meta = (line: string): boolean => {
        const [cmd, arg] = line.trim().split(/\s+/, 2);
        switch (cmd) {
            case '/quit':
            case '/exit':
                quit();
                return true;
            case '/help':
                notice = HELP;
                return true;
            case '/provider':
                notice = fake ? 'provider: fake' : `provider: ${liveProvider()} · model: ${liveModel()}`;
                return true;
            case '/log':
                notice = wire ? `wire log → ${wire.path}` : 'logging off (--no-log)';
                return true;
            case '/trace': {
                const path = writeTrace();
                notice = path ? `trace projections → ${path}` : 'tracing off — start with --trace or AGENT_TRACE=1';
                return true;
            }
            case '/verbose':
                verbose = !verbose;
                notice = `verbose ${verbose ? 'on' : 'off'}`;
                return true;
            case '/pane':
                scrollTarget = scrollTarget === 'chat' ? 'canvas' : 'chat';
                notice = `scroll → ${scrollTarget}`;
                return true;
            case '/keys':
                showKeys = !showKeys;
                notice = `key echo ${showKeys ? 'on — press a key' : 'off'}`;
                return true;
            case '/top':
                scrollTop();
                notice = `${scrollTarget} top`;
                return true;
            case '/bottom':
            case '/bot':
                scrollBottom();
                notice = `${scrollTarget} bottom`;
                return true;
            case '/reset':
                run.reset();
                leftScroll = 0;
                rightScroll = 0;
                notice = 'reset';
                return true;
            case '/seed':
                if (!arg) notice = 'usage: /seed <file.json>';
                else run.reset(JSON.parse(readFileSync(arg, 'utf8')) as Graph);
                return true;
            case '/save':
                if (arg) {
                    // `/save <file>` always exports the graph locally, in any mode.
                    notice = `wrote ${writeGraphFile(arg)} nodes → ${arg}`;
                } else if (connected) {
                    // `/save` (no arg, connected) persists to the backend, like the web's save button.
                    void saveAndPaint(); // repaints on completion
                } else {
                    writeGraphFile('graph.json');
                    notice = 'offline — wrote graph.json locally (no backend to save to)';
                }
                return true;
            case '/graph':
                notice = `wrote ${writeGraphFile('graph.json')} nodes → graph.json`;
                return true;
            default:
                return false;
        }
    };

    rl.on('line', line => {
        // A turn is in flight — ignore typed input until it settles. readline.pause() can't enforce this here:
        // paint()'s rl.prompt() re-arms input on every agent write, so this guard is the real gate. Keypress
        // scrolling still works (separate handler); Ctrl-C still aborts.
        if (busy) return;
        const text = line.trim();
        if (!text) {
            paint();
            return;
        }
        if (text.startsWith('/')) {
            // Meta commands touch the filesystem (/seed, /save, /graph); a bad path must not escape this handler
            // (main()'s catch has already resolved), or the process exits without restoring the terminal.
            try {
                if (!meta(text)) notice = `unknown command: ${text.split(/\s+/, 1)[0]} — /help`;
            } catch (err) {
                notice = errorMessage(err);
            }
            paint();
            return;
        }
        // An objective for the agent: snap both panes to the live tail, then drive the turn (paints via onChange).
        leftScroll = 0;
        rightScroll = 0;
        busy = true;
        userAborted = false;
        void run
            .submit(text)
            .catch((err: unknown) => {
                notice = `turn failed: ${errorMessage(err)}`;
            })
            .finally(() => {
                busy = false;
                if (userAborted) {
                    // Ctrl-C: set the notice here so it survives the onChange that cleared it, and skip the save.
                    userAborted = false;
                    notice = 'aborted';
                    paint();
                    return;
                }
                paint();
                // After the orchestrator's final message, persist to the backend (connected + autosave).
                if (autosave && run.getState()?.phase === 'done') void saveAndPaint();
            });
    });

    rl.on('SIGINT', () => {
        if (busy) {
            userAborted = true; // the submit .finally shows 'aborted' and skips the autosave
            run.abort();
        } else {
            quit();
        }
    });

    paint();
};

main().catch((error: unknown) => {
    process.stdout.write('\x1b[?1007l\x1b[?1049l');
    console.error('\nagent:terminal failed —', errorMessage(error));
    process.exitCode = 1;
});
