import { useMemo } from 'react';

import { createToolExecutor } from '@flows/agent';

import { AgentPanel } from './AgentPanel';
import { useAgentEnvironment } from '../hooks/useAgentEnvironment';
import { useLocatorAgent } from '../hooks/useLocatorAgent';
import { createCommandLlmGateway, createDesktopCanvasBinding } from '../utils';
import { withExecutorTracing, withGatewayTracing } from '../utils/agentTracing';

import type { WorkflowCanvasRef } from './WorkflowCanvas';
import type { RefObject } from 'react';

interface FlowAgentPanelProps {
    /** The live canvas ref the desktop CanvasBinding is built over. */
    canvasRef: RefObject<WorkflowCanvasRef | null>;
    flowId: string;
}

/**
 * App-side container for the locator agent: builds the concrete ports, drives the agent via
 * {@link useLocatorAgent}, and hands `session` + `send` to the presentational {@link AgentPanel}.
 * All the agent wiring lives here, so FlowEditorPage only mounts `<FlowAgentPanel />`.
 */
export const FlowAgentPanel = ({ canvasRef, flowId }: FlowAgentPanelProps) => {
    const binding = useMemo(() => createDesktopCanvasBinding(canvasRef), [canvasRef]);
    const { environment, traceReporter } = useAgentEnvironment();
    // Offline command gateway (no network/key); trace decorators emit llm.chat.* / tool.* through the environment.
    const gateway = useMemo(() => withGatewayTracing(createCommandLlmGateway(), traceReporter), [traceReporter]);
    const executor = useMemo(() => withExecutorTracing(createToolExecutor(), traceReporter), [traceReporter]);

    const { session, send } = useLocatorAgent({ binding, flowId, gateway, environment, executor });

    return <AgentPanel session={session} onSend={send} />;
};
