import { useMemo } from 'react';

import { createEngineCanvasBinding, toAgentGrant } from '@flows/agent';
import { useBlockRegistry } from '@flows/flows';
import { useWebSocketStore } from '@flows/socket';

import { AgentPanel } from './AgentPanel';
import { useAgent } from '../hooks/useAgent';
import { useAgentStorage } from '../hooks/useAgentStorage';
import { useAgentTrace } from '../hooks/useAgentTrace';
import { createBlockCatalogLookup, createGenerateApiLlmGateway } from '../utils';

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
 * The gateway is the backend-proxied {@link createGenerateApiLlmGateway}; its result arrives over the
 * live flow socket (state read fresh from {@link useWebSocketStore}). The generate receiver + tool
 * calls are pending in the socket layer, so the panel is wired but not yet functional end-to-end.
 */
export const FlowAgentPanel = ({ engine, flowId, permissions }: FlowAgentPanelProps) => {
    // Reads cannot lag a projection that pauses mid-drag; edits land in `transact`, so they
    // checkpoint for undo like a user drag.
    const binding = useMemo(() => createEngineCanvasBinding(engine), [engine]);
    const storage = useAgentStorage();
    const { tracer } = useAgentTrace();
    // Backend Generate API gateway; the model's answer returns over the flow socket. Connection state
    // is read fresh on every chat() call (a reconnect issues a new id), never cached. The agent wraps this
    // gateway with its own tracing decorator, so no app-side trace wrapper is needed here.
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
    // The user's flow-role permissions — the executor's ceiling on every specialist tool (a viewer's
    // move_node/rename is denied there, regardless of each agent's own fixed grant).
    const userPermissions = useMemo(() => toAgentGrant(permissions), [permissions]);
    // Block catalog behind the agent's node-read/config tools, from the live block registry.
    const blockRegistry = useBlockRegistry();
    const catalog = useMemo(() => createBlockCatalogLookup(blockRegistry), [blockRegistry]);

    const { session, send } = useAgent({ binding, flowId, gateway, storage, tracer, userPermissions, catalog });

    return <AgentPanel session={session} onSend={send} />;
};
