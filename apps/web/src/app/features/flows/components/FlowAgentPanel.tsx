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
 * App-side container for the locator agent: it builds the concrete ports — desktop CanvasBinding,
 * browser Agent Environment, and the (trace-wrapped) command gateway + tool executor — drives the
 * agent via {@link useLocatorAgent}, and hands the resulting `session` + `send` to the
 * presentational {@link AgentPanel}. All the agent wiring lives here, so FlowEditorPage only mounts
 * `<FlowAgentPanel />` and the panel itself stays a pure view.
 */
export const FlowAgentPanel = ({ canvasRef, flowId }: FlowAgentPanelProps) => {
    // The one seam between agent code and the React-owned live canvas.
    const binding = useMemo(() => createDesktopCanvasBinding(canvasRef), [canvasRef]);
    // The browser Agent Environment: session data flows through its storage port and run
    // lifecycle through its trace reporter (buffered in dev, noop in prod).
    const { environment, traceReporter } = useAgentEnvironment();
    // Today's outbound LLM dependency is the offline command gateway (structured commands → tool
    // calls, no network/key). Gateway and executor are wrapped with trace decorators so a real run
    // emits llm.chat.* and tool.* lifecycle events through the environment.
    const gateway = useMemo(() => withGatewayTracing(createCommandLlmGateway(), traceReporter), [traceReporter]);
    const executor = useMemo(() => withExecutorTracing(createToolExecutor(), traceReporter), [traceReporter]);

    const { session, send } = useLocatorAgent({ binding, flowId, gateway, environment, executor });

    return <AgentPanel session={session} onSend={send} />;
};
