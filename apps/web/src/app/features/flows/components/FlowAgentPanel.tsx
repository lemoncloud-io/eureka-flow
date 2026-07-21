import { useMemo } from 'react';

import { createToolExecutor } from '@flows/agent';

import { AgentPanel } from './AgentPanel';
import { useAgentEnvironment } from '../hooks/useAgentEnvironment';
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
 * App-side adaptor: wires the editor's world (the canvas ref + flow id) to the generic
 * {@link AgentPanel}. It owns all the agent construction — the desktop CanvasBinding, the browser
 * Agent Environment, and the (trace-wrapped) command gateway + tool executor — so FlowEditorPage
 * carries none of it and only mounts `<FlowAgentPanel />`.
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

    return (
        <AgentPanel binding={binding} flowId={flowId} gateway={gateway} environment={environment} executor={executor} />
    );
};
