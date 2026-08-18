import { useCallback, useEffect, useMemo, useState } from 'react';

import {
    ORCHESTRATOR_MODEL_TIER,
    agentModelResolver,
    createDefaultRoster,
    createEngineCanvasBinding,
    createModelGatewayFor,
    toAgentGrant,
} from '@flows/agent';
import { useBlockRegistry } from '@flows/flows';

import { AgentLauncher } from './AgentLauncher';
import { AgentPanel } from './AgentPanel';
import { useAgent } from '../hooks/useAgent';
import { useAgentModelCommit } from '../hooks/useAgentModelCommit';
import { useAgentModelSelection } from '../hooks/useAgentModelSelection';
import { useAgentStorage } from '../hooks/useAgentStorage';
import { useAgentTrace } from '../hooks/useAgentTrace';
import { useToolSocketConnection } from '../hooks/useToolSocketConnection';
import {
    createBlockCatalogLookup,
    createFlowJSONTransportReceiver,
    createGenerateApiLlmGateway,
    resolveBrowserAgentModelConfig,
} from '../utils';

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
 * (the completed result in the POST body).
 */
/** Whether the editor opens with the assistant showing. Persisted so it stays where the user left it;
 *  a storage failure (private mode, quota) just means the default, never a crash. */
const PANEL_OPEN_KEY = 'flow-agent-panel-open';

const readPanelOpen = (): boolean => {
    try {
        return localStorage.getItem(PANEL_OPEN_KEY) !== 'false';
    } catch {
        return true;
    }
};

const writePanelOpen = (open: boolean): void => {
    try {
        localStorage.setItem(PANEL_OPEN_KEY, String(open));
    } catch {
        // Not worth surfacing: the panel still opens and closes, it just forgets across reloads.
    }
};

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

    // The agent's reasoning model, chosen per flow (persisted) — drives the orchestrator + builder
    // (reasoning tier). Worker specialists resolve their own model from the deployment config below;
    // absent one, they inherit this. `selected` is the user's pick; `activeModel` is what the agent is
    // actually built with, committed only at a turn boundary so a running turn finishes on its own model.
    const { models, selected, setSelected } = useAgentModelSelection({ flowId, storage });
    const [activeModel, setActiveModel] = useState<string | undefined>(undefined);

    // The one connection snapshot every gateway (orchestrator + per-model children) reads fresh per call.
    const getConnection = useCallback(
        () => ({ ...toolSocket.getSnapshot(), generateReceiver: receiver.generateReceiver }),
        [toolSocket, receiver]
    );
    const gateway = useMemo(
        () => createGenerateApiLlmGateway({ getConnection, ...(activeModel ? { model: activeModel } : {}) }),
        [getConnection, activeModel]
    );

    // Per-agent deployment models (VITE_AGENT_MODEL_*), mirroring the CLI root: worker agents run their
    // configured/DEFAULT model; the reasoning tier (ORCHESTRATOR_MODEL_TIER) inherits the picked `gateway`.
    // `gatewayFor` builds one gateway per distinct model; `modelFor` tags children in the trace. No config
    // ⇒ every child shares `gateway` (a no-op).
    const { deploymentModels, defaultModel } = useMemo(() => resolveBrowserAgentModelConfig(), []);
    const modelFor = useMemo(
        () => agentModelResolver(createDefaultRoster(), deploymentModels, defaultModel, ORCHESTRATOR_MODEL_TIER),
        [deploymentModels, defaultModel]
    );
    const gatewayFor = useMemo(
        () =>
            createModelGatewayFor({
                modelForType: modelFor,
                defaultGateway: gateway,
                gatewayFactory: model => createGenerateApiLlmGateway({ getConnection, model }),
            }),
        [modelFor, gateway, getConnection]
    );
    // The user's flow-role permissions — the executor's ceiling on every specialist tool (a viewer's
    // move_node/rename is denied there, regardless of each agent's own fixed grant).
    const userPermissions = useMemo(() => toAgentGrant(permissions), [permissions]);
    // Block catalog behind the agent's node-read/config tools, from the live block registry.
    const blockRegistry = useBlockRegistry();
    const catalog = useMemo(() => createBlockCatalogLookup(blockRegistry), [blockRegistry]);

    const { session, send, abort } = useAgent({
        binding,
        flowId,
        gateway,
        model: activeModel,
        storage,
        tracer,
        userPermissions,
        catalog,
        gatewayFor,
        modelFor,
    });

    // Commit the pick at the turn boundary: immediately while idle, deferred until a running turn
    // settles. Rebuilding `gateway` (→ the agent) only when idle means a change never aborts a live
    // turn — it applies to the NEXT turn. (Changing `activeModel` rebuilds the agent; the transcript
    // rehydrates from storage, so the conversation is preserved.)
    const running = session?.phase === 'thinking';
    useAgentModelCommit({ selected, running, commit: setActiveModel });

    // Every catalog model is selectable: the agent's reasoning model runs server-side via
    // /runs/0/generate (platform key), so it is NOT gated by the user's BYO provider keys the way
    // the generator block's ModelSelect is.
    const modelOptions = useMemo(() => models.map(m => ({ name: m.name, label: m.label })), [models]);

    // Kept here, not in FlowEditorPage: `useAgent` lives in this component and unmounting it aborts the
    // turn in flight (`useAgentSession`), so collapsing has to hide the panel without dropping the agent.
    const [open, setOpen] = useState(() => readPanelOpen());
    const setOpenPersisted = useCallback((next: boolean) => {
        setOpen(next);
        writePanelOpen(next);
    }, []);

    if (!open) {
        return <AgentLauncher session={session} onOpen={() => setOpenPersisted(true)} />;
    }

    return (
        <AgentPanel
            session={session}
            onSend={send}
            models={modelOptions}
            selectedModel={selected}
            onSelectModel={setSelected}
            onAbort={abort}
            onClose={() => setOpenPersisted(false)}
        />
    );
};
