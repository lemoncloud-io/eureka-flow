import { useMemo } from 'react';

import { createEngineCanvasBinding, toAgentGrant } from '@flows/agent';
import { useBlockRegistry } from '@flows/flows';
import { useWebSocketStore } from '@flows/socket';

import { AgentPanel } from './AgentPanel';
import { useAgent } from '../hooks/useAgent';
import { useAgentEnvironment } from '../hooks/useAgentEnvironment';
import { createBlockCatalogLookup, createEurekaToolCallLlmGateway, createGenerateApiLlmGateway } from '../utils';
import { withGatewayTracing } from '../utils/agentTracing';

import type { LlmGateway } from '@flows/agent';
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
 * Selects the production gateway. Defaults to the existing text-only, socket-delivered
 * {@link createGenerateApiLlmGateway} — unchanged behavior when nothing is configured.
 *
 * Set `VITE_EUREKA_TOOL_CALL_ENDPOINT` to opt into {@link createEurekaToolCallLlmGateway} instead
 * — the tool-capable, non-streaming-HTTP gateway that calls eureka-flows-api's (not yet deployed)
 * tool-calling endpoint. See `docs/browser-agent/foundations/eureka-tool-calling-endpoint-contract.md`.
 * Deliberately off by default: flipping this on before the backend endpoint exists would just
 * turn every agent turn into a guaranteed network error, not a silent no-op.
 */
const createProductionGateway = (): LlmGateway => {
    const endpointPath = import.meta.env['VITE_EUREKA_TOOL_CALL_ENDPOINT'] as string | undefined;
    if (!endpointPath) {
        return createGenerateApiLlmGateway({
            getConnection: () => {
                const { isConnected, id } = useWebSocketStore.getState();
                return { isConnected, connectionId: id, generateReceiver: null };
            },
        });
    }

    const provider = (import.meta.env['VITE_EUREKA_TOOL_CALL_PROVIDER'] as string | undefined) ?? 'openai';
    const requestedModel = (import.meta.env['VITE_EUREKA_TOOL_CALL_MODEL'] as string | undefined) ?? 'gpt-4o-mini';
    return createEurekaToolCallLlmGateway({ provider, requestedModel, endpointPath });
};

/**
 * App-side container for the **orchestrator** agent: builds the concrete ports, drives the agent via
 * {@link useAgent}, and hands `session` + `send` to the presentational {@link AgentPanel}. All the
 * agent wiring lives here, so FlowEditorPage only mounts `<FlowAgentPanel />`.
 *
 * The gateway is selected by {@link createProductionGateway} — the backend-proxied,
 * socket-delivered {@link createGenerateApiLlmGateway} by default (its result arrives over the
 * live flow socket; the generate receiver + tool calls are pending in the socket layer, so this
 * path is wired but not yet functional end-to-end), or the tool-capable, non-streaming-HTTP
 * {@link createEurekaToolCallLlmGateway} when `VITE_EUREKA_TOOL_CALL_ENDPOINT` is configured.
 */
export const FlowAgentPanel = ({ engine, flowId, permissions }: FlowAgentPanelProps) => {
    // Reads cannot lag a projection that pauses mid-drag; edits land in `transact`, so they
    // checkpoint for undo like a user drag.
    const binding = useMemo(() => createEngineCanvasBinding(engine), [engine]);
    const { environment, traceReporter } = useAgentEnvironment();
    const gateway = useMemo(() => withGatewayTracing(createProductionGateway(), traceReporter), [traceReporter]);
    // The user's flow-role permissions — the executor's ceiling on every specialist tool (a viewer's
    // move_node/rename is denied there, regardless of each agent's own fixed grant).
    const userPermissions = useMemo(() => toAgentGrant(permissions), [permissions]);
    // Block catalog behind the agent's node-read/config tools, from the live block registry.
    const blockRegistry = useBlockRegistry();
    const catalog = useMemo(() => createBlockCatalogLookup(blockRegistry), [blockRegistry]);

    const { session, send } = useAgent({ binding, flowId, gateway, environment, userPermissions, catalog });

    return <AgentPanel session={session} onSend={send} />;
};
