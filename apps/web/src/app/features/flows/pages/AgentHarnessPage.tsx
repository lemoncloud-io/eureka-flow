import { useEffect, useMemo, useState } from 'react';

import { createCatalogLookup, createInMemoryCanvasBinding } from '@flows/agent';
import { useWebSocketStore } from '@flows/socket';

import { AgentPanel } from '../components/AgentPanel';
import { useAgent } from '../hooks/useAgent';
import { useAgentPorts } from '../hooks/useAgentPorts';
import { createGenerateApiLlmGateway } from '../utils';

import type { NodeData } from '@lemoncloud/eureka-flows-api';

const HARNESS_FLOW_ID = 'agent-harness';
const TEXT_INPUT_NODE: NodeData = { id: 'text-1', type: 'text-input', position: { x: 100, y: 200 } };
// Stable identity: an inline literal would be a new object each render, and the 250ms poll below would
// otherwise rebuild (and abort) the agent on every tick.
const HARNESS_PERMISSIONS = { canModifyCanvas: true, canEditConfig: true };

/**
 * Dev-only harness route (`/dev/agent-harness`) for real-browser verification of the
 * **orchestrator** flow. It mounts the real AgentPanel over an in-memory canvas
 * and drives it through the backend-proxied {@link createGenerateApiLlmGateway} (result over the
 * flow socket), while session state persists through BrowserAgentStorage and lifecycle events hit
 * the tracer.
 *
 * Everything below the panel is a read-only trace surface rendered by the app itself: the live node
 * position, the storage keys (read through the storage port), and the trace event
 * stream (event names only). The generate receiver + tool calls are pending in the socket layer, so
 * the run is wired but not yet functional end-to-end.
 */
export const AgentHarnessPage = () => {
    const { storage, tracer, getTraceEntries } = useAgentPorts();

    const binding = useMemo(() => createInMemoryCanvasBinding({ nodes: [{ ...TEXT_INPUT_NODE }], edges: [] }), []);
    const catalog = useMemo(() => createCatalogLookup([]), []);
    const gateway = useMemo(
        () =>
            createGenerateApiLlmGateway({
                getConnection: () => {
                    const { isConnected, id } = useWebSocketStore.getState();
                    return { isConnected, connectionId: id, generateReceiver: null };
                },
            }),
        []
    );

    const { session, send } = useAgent({
        binding,
        flowId: HARNESS_FLOW_ID,
        gateway,
        catalog,
        storage,
        tracer,
        userPermissions: HARNESS_PERMISSIONS,
    });

    // The in-memory binding has no subscription; poll it (and the trace surfaces)
    // a few times per second — plenty for a dev harness.
    const [, setTick] = useState(0);
    const [storageKeys, setStorageKeys] = useState<string[]>([]);
    useEffect(() => {
        const id = setInterval(() => {
            setTick(t => t + 1);
            void storage
                .listKeys('session:')
                .then(keys => setStorageKeys(keys))
                .catch(() => undefined);
        }, 250);
        return () => clearInterval(id);
    }, [storage]);

    const node = binding.readGraph().nodes[0];
    const traceMessages = getTraceEntries().map(entry => `${entry.level}:${entry.event}`);

    return (
        <div style={{ display: 'flex', height: '100vh' }}>
            <div style={{ flex: 1, padding: 24, fontFamily: 'monospace', overflow: 'auto' }}>
                <h1 style={{ fontSize: 18, marginBottom: 12 }}>Agent Host Harness (dev only)</h1>
                <p style={{ marginBottom: 8 }}>
                    Scenario: ask the orchestrator to move the text input right. Drives the backend Generate API gateway
                    (result over the flow socket); tool calls are pending in the socket layer.
                </p>
                <p data-testid="node-position" style={{ marginBottom: 8 }}>
                    node position: x={node.position.x}, y={node.position.y}
                </p>
                <p data-testid="storage-keys" style={{ marginBottom: 8 }}>
                    storage keys: {storageKeys.length === 0 ? '(none yet)' : storageKeys.join(', ')}
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
