import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
    BufferAgentTraceReporter,
    createBrowserAgentEnvironment,
    createFakeGateway,
    createInMemoryCanvasBinding,
    createToolExecutor,
} from '@flows/agent';

import { AgentPanel } from '../../app/features/flows/components/AgentPanel';
import { useLocatorAgent } from '../../app/features/flows/hooks/useLocatorAgent';
import { withExecutorTracing, withGatewayTracing } from '../../app/features/flows/utils/agentTracing';
import { createCommandLlmGateway } from '../../app/features/flows/utils/createCommandLlmGateway';

import type { Chunk, LlmGateway } from '@flows/agent';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

const makeNode = (id: string, x: number, y: number, extra: Partial<NodeData> = {}): NodeData => ({
    id,
    type: 'test',
    position: { x, y },
    ...extra,
});

// The real browser environment over jsdom's localStorage, with a buffered reporter so tests
// can assert the trace of the actual run.
const makeEnvironment = () => {
    const traceReporter = new BufferAgentTraceReporter();
    const environment = createBrowserAgentEnvironment({ traceReporter });
    return { environment, traceReporter };
};

// Submit with Enter — the composer's Send is the only button, but Enter is the robust hook.
const typeAndSend = (text: string) => {
    const box = screen.getByRole('textbox');
    fireEvent.change(box, { target: { value: text } });
    fireEvent.keyDown(box, { key: 'Enter' });
};

// `send` is gated until the async storage read settles (hydration). Flush that microtask after
// render so the first send isn't a no-op. Mirrors the sub-millisecond real-app window.
const flushHydration = () =>
    act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });

afterEach(() => {
    cleanup();
    localStorage.clear(); // sessions persist per flowId; isolate tests that share flowId="f"
});

// AgentPanel is now a pure view; this harness reunites it with the real agent hook (fed injected
// fakes) so these tests still drive the whole flow end-to-end — hook → executor → canvas + environment.
const Harness = (args: Parameters<typeof useLocatorAgent>[0]) => {
    const { session, send } = useLocatorAgent(args);
    return <AgentPanel session={session} onSend={send} />;
};

describe('AgentPanel', () => {
    it('applies a move and shows the transcript when the gateway returns a tool call', async () => {
        const binding = createInMemoryCanvasBinding({
            nodes: [makeNode('n1', 200, 80, { type: 'http', customLabel: 'Fetch' })],
            edges: [],
        });
        const gateway = createFakeGateway([
            { toolCalls: [{ name: 'move_node', args: { nodeId: 'n1', by: { dx: 10, dy: 0 } } }] },
            { text: 'Moved Fetch 10px right to (210, 80).' },
        ]);
        const { environment } = makeEnvironment();

        render(<Harness binding={binding} flowId="f" gateway={gateway} environment={environment} />);
        await flushHydration();
        typeAndSend('move Fetch right 10');

        // The move is applied to the (in-memory) canvas...
        await waitFor(() => {
            expect(binding.readGraph().nodes[0].position).toEqual({ x: 210, y: 80 });
        });
        // ...and both the user's message and the agent's confirmation are shown.
        expect(await screen.findByText(/Moved Fetch/)).toBeTruthy();
        expect(screen.getByText('move Fetch right 10')).toBeTruthy();
    });

    it('drives the offline command gateway end-to-end from a typed command', async () => {
        const binding = createInMemoryCanvasBinding({
            nodes: [makeNode('n1', 200, 80, { type: 'http', customLabel: 'Fetch' })],
            edges: [],
        });
        const { environment } = makeEnvironment();

        render(<Harness binding={binding} flowId="f" gateway={createCommandLlmGateway()} environment={environment} />);
        await flushHydration();
        typeAndSend('move(Fetch, up, 10)');

        await waitFor(() => {
            expect(binding.readGraph().nodes[0].position).toEqual({ x: 200, y: 70 });
        });
        expect(await screen.findByText(/Moved Fetch/)).toBeTruthy();
    });

    it('runs real data through the environment: namespaced session key + lifecycle trace', async () => {
        // Real-browser Environment verification, component form: the actual run (fake LLM →
        // executor → canvas) must persist through BrowserAgentStorage and emit lifecycle trace events.
        // No self-check helper involved — this is the real flow's own behavior.
        const binding = createInMemoryCanvasBinding({
            nodes: [makeNode('text-1', 100, 200, { type: 'text-input' })],
            edges: [],
        });
        const { environment, traceReporter } = makeEnvironment();
        const gateway = withGatewayTracing(
            createFakeGateway([
                {
                    text: 'Moving the text input 10px to the right.',
                    toolCalls: [{ name: 'move_node', args: { nodeId: 'text-1', by: { dx: 10, dy: 0 } } }],
                },
                { text: 'Done.' },
            ]),
            traceReporter
        );
        const executor = withExecutorTracing(createToolExecutor(), traceReporter);

        render(
            <Harness
                binding={binding}
                flowId="harness"
                gateway={gateway}
                environment={environment}
                executor={executor}
            />
        );
        await flushHydration();
        typeAndSend('move the text input 10px right');

        // The node moved through the real executor path...
        await waitFor(() => {
            expect(binding.readGraph().nodes[0].position).toEqual({ x: 110, y: 200 });
        });
        await waitFor(() => expect(screen.getByText(/Done\./)).toBeTruthy());

        // ...the run's session record landed under the environment's namespace...
        await waitFor(() => {
            expect(localStorage.getItem('flow_mosaic_agent_session:harness')).toBeTruthy();
        });

        // ...and the trace captured the real lifecycle in order.
        const messages = traceReporter.entries.map(entry => entry.message);
        for (const expected of [
            'agent.run.start',
            'llm.chat.start',
            'tool.dispatch',
            'tool.result',
            'agent.run.done',
        ]) {
            expect(messages).toContain(expected);
        }
        expect(messages.indexOf('agent.run.start')).toBeLessThan(messages.indexOf('llm.chat.start'));
        expect(messages.indexOf('tool.dispatch')).toBeLessThan(messages.indexOf('tool.result'));
        await waitFor(() => expect(traceReporter.entries.map(e => e.message)).toContain('agent.run.done'));
    });

    it('traces agent.run.error (not agent.run.done) when the run ends in an error phase', async () => {
        // BaseAgent converts a failing turn into session.error rather than rejecting; the run
        // trace must reflect that outcome instead of a misleading agent.run.done.
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('n1', 0, 0)], edges: [] });
        const failingGateway: LlmGateway = {
            async *chat(): AsyncIterable<Chunk> {
                await Promise.reject(new Error('gateway boom'));
                yield { done: true }; // unreachable — satisfies require-yield
            },
        };
        const { environment, traceReporter } = makeEnvironment();

        render(<Harness binding={binding} flowId="f" gateway={failingGateway} environment={environment} />);
        await flushHydration();
        typeAndSend('do something');

        await waitFor(() => expect(traceReporter.entries.map(e => e.message)).toContain('agent.run.error'));
        expect(traceReporter.entries.map(e => e.message)).not.toContain('agent.run.done');
    });
});
