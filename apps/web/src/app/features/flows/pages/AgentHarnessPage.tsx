import { useEffect, useMemo, useState } from 'react';

import { createFakeGateway, createInMemoryCanvasBinding, createToolExecutor } from '@flows/agent';

import { AgentPanel } from '../components/AgentPanel';
import { useAgentEnvironment } from '../hooks/useAgentEnvironment';
import { useLocatorAgent } from '../hooks/useLocatorAgent';
import { withExecutorTracing, withGatewayTracing } from '../utils/agentTracing';

import type { NodeData } from '@lemoncloud/eureka-flows-api';

const HARNESS_FLOW_ID = 'agent-harness';
const TEXT_INPUT_NODE: NodeData = { id: 'text-1', type: 'text-input', position: { x: 100, y: 200 } };

/**
 * Dev-only harness route (`/dev/agent-harness`) for real-browser verification of the
 * environment-backed agent flow, runnable without editor
 * auth or any backend: the real AgentPanel UI drives a scripted fake LLM whose tool call
 * flows through the real ToolExecutor into an in-memory canvas binding, while session
 * state persists through BrowserAgentStorage and lifecycle events hit the trace reporter.
 *
 * Everything below the panel is read-only observability rendered by the app itself (no
 * DevTools, no self-check helper): the live node position, the environment storage keys
 * (read through the storage port), and the trace event stream (messages only).
 */
export const AgentHarnessPage = () => {
    const { environment, traceReporter, getTraceEntries } = useAgentEnvironment();

    const binding = useMemo(() => createInMemoryCanvasBinding({ nodes: [{ ...TEXT_INPUT_NODE }], edges: [] }), []);
    const gateway = useMemo(
        () =>
            withGatewayTracing(
                createFakeGateway([
                    {
                        text: 'Moving the text input 10px to the right.',
                        toolCalls: [{ name: 'move_node', args: { nodeId: 'text-1', by: { dx: 10, dy: 0 } } }],
                    },
                    { text: 'Done — the text input is at its new position.' },
                ]),
                traceReporter
            ),
        [traceReporter]
    );
    const executor = useMemo(() => withExecutorTracing(createToolExecutor(), traceReporter), [traceReporter]);

    const { session, send } = useLocatorAgent({ binding, flowId: HARNESS_FLOW_ID, gateway, environment, executor });

    // The in-memory binding has no subscription; poll it (and the observability surfaces)
    // a few times per second — plenty for a dev harness.
    const [, setTick] = useState(0);
    const [storageKeys, setStorageKeys] = useState<string[]>([]);
    useEffect(() => {
        const id = setInterval(() => {
            setTick(t => t + 1);
            void environment.storage
                .listKeys('session:')
                .then(keys => setStorageKeys(keys))
                .catch(() => undefined);
        }, 250);
        return () => clearInterval(id);
    }, [environment]);

    const node = binding.readGraph().nodes[0];
    const traceMessages = getTraceEntries().map(entry => `${entry.level}:${entry.message}`);

    return (
        <div style={{ display: 'flex', height: '100vh' }}>
            <div style={{ flex: 1, padding: 24, fontFamily: 'monospace', overflow: 'auto' }}>
                <h1 style={{ fontSize: 18, marginBottom: 12 }}>Agent Environment Harness (dev only)</h1>
                <p style={{ marginBottom: 8 }}>
                    Scenario: ask the agent to move the text input 10px right (fake LLM script). Expected: x: 100 → 110.
                </p>
                <p data-testid="node-position" style={{ marginBottom: 8 }}>
                    node position: x={node.position.x}, y={node.position.y}
                </p>
                <p data-testid="storage-keys" style={{ marginBottom: 8 }}>
                    environment storage keys: {storageKeys.length === 0 ? '(none yet)' : storageKeys.join(', ')}
                </p>
                <div data-testid="trace-events">
                    <p>trace events ({traceMessages.length}):</p>
                    <ol style={{ paddingLeft: 20 }}>
                        {traceMessages.map((message, index) => (
                            <li key={index}>{message}</li>
                        ))}
                    </ol>
                </div>
            </div>
            <AgentPanel session={session} onSend={send} />
        </div>
    );
};
