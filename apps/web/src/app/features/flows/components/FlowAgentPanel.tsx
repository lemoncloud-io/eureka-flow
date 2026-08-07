import { useEffect, useMemo } from 'react';

import { createEngineCanvasBinding, toAgentGrant } from '@flows/agent';
import { useBlockRegistry } from '@flows/flows';

import { AgentPanel } from './AgentPanel';
import { useAgent } from '../hooks/useAgent';
import { useAgentStorage } from '../hooks/useAgentStorage';
import { useAgentTrace } from '../hooks/useAgentTrace';
import { useToolSocketConnection } from '../hooks/useToolSocketConnection';
import { createBlockCatalogLookup, createFlowJSONTransportReceiver, createGenerateApiLlmGateway } from '../utils';

import type { FlowEngine } from '@flows/engine';
import type { FlowPermissions } from '@flows/flows';

interface FlowAgentPanelProps {
    /** The engine that owns this screen's graph. Not a canvas ref, so any screen holding an engine can mount this. */
    engine: FlowEngine;
    flowId: string;
    /** The flow's live permissions; projected onto the user-permission ceiling the executor enforces. */
    permissions: FlowPermissions;
}

/**
 * App-side container for the **orchestrator** agent: builds the concrete ports, drives the agent via
 * {@link useAgent}, and hands `session` + `send` to the presentational {@link AgentPanel}. All the
 * agent wiring lives here, so FlowEditorPage only mounts `<FlowAgentPanel />`.
 *
 * The gateway is the tool-capable {@link createGenerateApiLlmGateway} over `POST /runs/0/generate`.
 * Its result is delivered over the dedicated tool WebSocket ({@link useToolSocketConnection}),
 * reassembled by a {@link createFlowJSONTransportReceiver} JSONTransport receiver and correlated by
 * request id. When the tool socket has no connection id the gateway falls back to HTTP-only delivery
 * (the completed result in the POST body). See `docs/browser-agent/design/flow-api-gateway.md`.
 */
export const FlowAgentPanel = ({ engine, flowId, permissions }: FlowAgentPanelProps) => {
    // Reads cannot lag a projection that pauses mid-drag; edits land in `transact`, so they
    // checkpoint for undo like a user drag.
    const binding = useMemo(() => createEngineCanvasBinding(engine), [engine]);
    const storage = useAgentStorage();
    const { tracer } = useAgentTrace();
    // Dedicated tool socket + JSONTransport receiver: the model's answer (text and/or tool calls) arrives
    // over this socket, correlated by request id. The agent wraps the gateway with its own tracing decorator.
    const toolSocket = useToolSocketConnection();
    const receiver = useMemo(() => createFlowJSONTransportReceiver(toolSocket), [toolSocket]);
    useEffect(() => receiver.attach(), [receiver]);
    const gateway = useMemo(
        () =>
            createGenerateApiLlmGateway({
                toolCalls: true,
                getConnection: () => ({ ...toolSocket.getSnapshot(), generateReceiver: receiver.generateReceiver }),
            }),
        [toolSocket, receiver]
    );
    // The user's flow-role permissions — the executor's ceiling on every specialist tool (a viewer's
    // move_node/rename is denied there, regardless of each agent's own fixed grant).
    const userPermissions = useMemo(() => toAgentGrant(permissions), [permissions]);
    // Block catalog behind the agent's node-read/config tools, from the live block registry.
    const blockRegistry = useBlockRegistry();
    const catalog = useMemo(() => createBlockCatalogLookup(blockRegistry), [blockRegistry]);

    const { session, send } = useAgent({ binding, flowId, gateway, storage, tracer, userPermissions, catalog });

    return <AgentPanel session={session} onSend={send} />;
};
