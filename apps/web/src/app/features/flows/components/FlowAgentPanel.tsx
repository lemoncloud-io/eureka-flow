import { useMemo } from 'react';

import { toAgentGrant } from '@flows/agent';
import { useBlockRegistry } from '@flows/flows';
import { useWebSocketStore } from '@flows/socket';

import { AgentPanel } from './AgentPanel';
import { useAgent } from '../hooks/useAgent';
import { useAgentEnvironment } from '../hooks/useAgentEnvironment';
import { createBlockCatalogLookup, createDesktopCanvasBinding, createGenerateApiLlmGateway } from '../utils';
import { withGatewayTracing } from '../utils/agentTracing';

import type { WorkflowCanvasRef } from './WorkflowCanvas';
import type { FlowPermissions } from '@flows/flows';
import type { RefObject } from 'react';

interface FlowAgentPanelProps {
    /** The live canvas ref the desktop CanvasBinding is built over. */
    canvasRef: RefObject<WorkflowCanvasRef | null>;
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
export const FlowAgentPanel = ({ canvasRef, flowId, permissions }: FlowAgentPanelProps) => {
    const binding = useMemo(() => createDesktopCanvasBinding(canvasRef), [canvasRef]);
    const { environment, traceReporter } = useAgentEnvironment();
    // Backend Generate API gateway; the model's answer returns over the flow socket. Connection state
    // is read fresh on every chat() call (a reconnect issues a new id), never cached.
    const gateway = useMemo(
        () =>
            withGatewayTracing(
                createGenerateApiLlmGateway({
                    getConnection: () => {
                        const { isConnected, id } = useWebSocketStore.getState();
                        return { isConnected, connectionId: id, generateReceiver: null };
                    },
                }),
                traceReporter
            ),
        [traceReporter]
    );
    // The user's flow-role permissions — the executor's ceiling on every specialist tool (a viewer's
    // move_node/rename is denied there, regardless of each agent's own fixed grant).
    const userPermissions = useMemo(() => toAgentGrant(permissions), [permissions]);
    // Block catalog behind the agent's node-read/config tools, from the live block registry.
    const blockRegistry = useBlockRegistry();
    const catalog = useMemo(() => createBlockCatalogLookup(blockRegistry), [blockRegistry]);

    const { session, send } = useAgent({ binding, flowId, gateway, environment, userPermissions, catalog });

    return <AgentPanel session={session} onSend={send} />;
};
