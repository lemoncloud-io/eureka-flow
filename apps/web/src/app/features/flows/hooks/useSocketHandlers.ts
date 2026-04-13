import { useCallback, useEffect, useRef } from 'react';

import { toast } from 'sonner';

import { EXECUTE_FUNCTIONS, getNode, getPortData, useCanvasStore } from '@flows/flows';

import type { WorkflowCanvasRef } from '../components/WorkflowCanvas';
import type { BlockDefinitionWithFrontend } from '@flows/flows';
import type { NodeUpdateInfo, PortUpdateInfo, TraceUpdateInfo } from '@flows/socket';
import type { RefObject } from 'react';

interface UseSocketHandlersParams {
    canvasRef: RefObject<WorkflowCanvasRef | null>;
    blockRegistry: Record<string, BlockDefinitionWithFrontend>;
    currentFlowId: string | null;
    loadFlowById: (flowId: string) => Promise<unknown>;
    lastSavedStateRef: RefObject<string | null>;
    serializeWorkflowState: (data: { nodes?: unknown[]; connections?: unknown[]; edges?: unknown[] }) => string;
}

const getNodeDisplayName = (
    nodeId: string,
    canvasRef: RefObject<WorkflowCanvasRef | null>,
    blockRegistry: Record<string, BlockDefinitionWithFrontend>
): string => {
    const node = canvasRef.current?.getWorkflow()?.nodes?.find(n => n.id === nodeId);
    const label = node?.customLabel || (node?.type ? blockRegistry[node.type]?.label : undefined);
    return label ? `${label} (${nodeId})` : nodeId;
};

export const useSocketHandlers = ({
    canvasRef,
    blockRegistry,
    currentFlowId,
    loadFlowById,
    lastSavedStateRef,
    serializeWorkflowState,
}: UseSocketHandlersParams) => {
    const nodeNoRef = useRef<Map<string, number>>(new Map());
    const nodeRunIdRef = useRef<Map<string, string>>(new Map());
    const portNoRef = useRef<Map<string, number>>(new Map());
    const highlightTimeoutsRef = useRef<Map<string, number>>(new Map());
    const lastLocalUpdateTimestampRef = useRef<number | null>(null);

    const appendTraceLog = useCanvasStore(state => state.appendTraceLog);
    const clearTraceLogs = useCanvasStore(state => state.clearTraceLogs);
    const setUpdatedPort = useCanvasStore(state => state.setUpdatedPort);
    const clearUpdatedPort = useCanvasStore(state => state.clearUpdatedPort);

    const handleFlowUpdate = useCallback(
        async (flowId: string) => {
            try {
                const flowData = await loadFlowById(flowId);
                if (canvasRef.current && flowData) {
                    await canvasRef.current.loadWorkflow(flowData as Parameters<WorkflowCanvasRef['loadWorkflow']>[0]);
                    lastSavedStateRef.current = serializeWorkflowState(flowData as { nodes?: unknown[] });
                }
            } catch (error) {
                console.error('[FlowEditor] Failed to reload flow:', error);
            }
        },
        [loadFlowById, canvasRef, lastSavedStateRef, serializeWorkflowState]
    );

    const handleNodeUpdate = useCallback(
        async (info: NodeUpdateInfo) => {
            const { nodeId, flowId, isPort, parentNodeId, state, progress, no, stage, error } = info;

            // Node messages may omit flowId — channel subscription already filters by flow
            if (flowId && flowId !== currentFlowId) return;

            // Reset sequence tracking when runId changes (new execution run)
            const { runId } = info;
            if (runId) {
                const prevRunId = nodeRunIdRef.current.get(nodeId);
                if (prevRunId && prevRunId !== runId) {
                    nodeNoRef.current.delete(nodeId);
                }
                nodeRunIdRef.current.set(nodeId, runId);
            }

            if (no !== undefined) {
                const prevNo = nodeNoRef.current.get(nodeId);
                if (prevNo !== undefined && prevNo >= no) return;
                nodeNoRef.current.set(nodeId, no);
            }

            if (!canvasRef.current) return;

            // New execution starting: clear trace logs
            if (state === 'RUNNING' && no !== undefined && no <= 1) {
                clearTraceLogs(nodeId);
            }

            if (isPort && parentNodeId) {
                if (state) {
                    canvasRef.current.updateNodeFromServer(parentNodeId, { state, status: state });
                }
                return;
            }

            if (state === 'ERROR') {
                let errMsg = error;
                if (stage !== 'final') {
                    try {
                        const nodeData = await getNode(nodeId);
                        errMsg = nodeData.error ?? nodeData.errorMessage;
                    } catch {
                        if (no !== undefined) {
                            const prevNo = nodeNoRef.current.get(nodeId);
                            if (prevNo === no) nodeNoRef.current.delete(nodeId);
                        }
                    }
                }
                canvasRef.current.updateNodeFromServer(nodeId, {
                    state,
                    status: state,
                    error: errMsg,
                    errorMessage: errMsg,
                });

                const displayName = getNodeDisplayName(nodeId, canvasRef, blockRegistry);
                toast.error(`${displayName} failed`, {
                    description: errMsg ? String(errMsg).slice(0, 80) : undefined,
                    duration: 8000,
                });
                return;
            }

            const isTerminal = state === 'COMPLETED' || state === 'ERROR';
            const executionStats =
                state === 'RUNNING'
                    ? { startTime: Date.now(), duration: 0, progress: progress ?? 0 }
                    : isTerminal
                      ? { progress: progress ?? 100 }
                      : progress !== undefined
                        ? { progress }
                        : undefined;

            canvasRef.current.updateNodeFromServer(nodeId, { state, status: state, executionStats });

            if (state === 'COMPLETED') {
                const displayName = getNodeDisplayName(nodeId, canvasRef, blockRegistry);
                toast.success(`${displayName} completed`, { duration: 4000 });
            }

            if (state !== 'READY') return;

            const workflow = canvasRef.current.getWorkflow();
            const node = workflow?.nodes?.find(n => n.id === nodeId);
            if (!node?.type) return;

            const nodeDef = blockRegistry[node.type];
            if (!nodeDef?.isFrontend || !EXECUTE_FUNCTIONS[nodeDef.type]) return;
            if (nodeDef.stereo === 'input') return;

            const hasAllInputs = (nodeDef.inputs ?? []).every(input => node.inputData?.[input.id]?.value !== undefined);
            if (!hasAllInputs) return;

            setTimeout(() => canvasRef.current?.executeNode(nodeId), 0);
        },
        [blockRegistry, currentFlowId, clearTraceLogs, canvasRef]
    );

    const handlePortUpdate = useCallback(
        async (info: PortUpdateInfo) => {
            const { portId, nodeId, flowId, portName, no } = info;

            if (!flowId || flowId !== currentFlowId) return;

            if (no !== undefined) {
                const prevNo = portNoRef.current.get(portId);
                if (prevNo !== undefined && prevNo >= no) return;
                portNoRef.current.set(portId, no);
            }

            const existingTimeout = highlightTimeoutsRef.current.get(portId);
            if (existingTimeout) window.clearTimeout(existingTimeout);
            setUpdatedPort(portId);
            const timeoutId = window.setTimeout(() => {
                clearUpdatedPort(portId);
                highlightTimeoutsRef.current.delete(portId);
            }, 500);
            highlightTimeoutsRef.current.set(portId, timeoutId);

            if (!canvasRef.current) return;

            const isOutputPort = portName === 'out';

            if (!isOutputPort) {
                const workflow = canvasRef.current.getWorkflow();
                const nodeInCanvas = workflow?.nodes?.find(n => n.id === nodeId);
                if (nodeInCanvas?.type) {
                    const nodeDef = blockRegistry[nodeInCanvas.type];
                    const isTerminalNode = !nodeDef?.output$ || nodeDef.output$.length === 0;
                    if (!isTerminalNode) return;
                }
            }

            const direction = isOutputPort ? 'out' : 'in';

            try {
                const portData = await getPortData(portId, direction);
                if (portData?.data) {
                    const dataPacket = {
                        value: portData.data.value,
                        type: portData.data.type,
                        timestamp: portData.data.timestamp,
                    };
                    const portKey = portData.portId || portName || direction;
                    const updates = isOutputPort
                        ? { outputData: { [portKey]: dataPacket } }
                        : { inputData: { [portKey]: dataPacket } };
                    canvasRef.current.updateNodeFromServer(nodeId, updates);
                }
            } catch (err) {
                if (no !== undefined) {
                    const prevNo = portNoRef.current.get(portId);
                    if (prevNo === no) portNoRef.current.delete(portId);
                }
                console.debug('[handlePortUpdate] Failed to fetch port data:', portId, err);
            }
        },
        [setUpdatedPort, clearUpdatedPort, blockRegistry, currentFlowId, canvasRef]
    );

    const handleTraceUpdate = useCallback(
        (info: TraceUpdateInfo) => {
            const { nodeId, seq, ts, stage, message, runId, data } = info;
            appendTraceLog(nodeId, { seq, ts, stage, message, runId, data });
        },
        [appendTraceLog]
    );

    // Cleanup highlight timeouts on unmount
    useEffect(() => {
        const timeoutsMap = highlightTimeoutsRef.current;
        return () => {
            timeoutsMap.forEach(id => window.clearTimeout(id));
            timeoutsMap.clear();
        };
    }, []);

    // Clear sequence tracking when flow changes
    useEffect(() => {
        nodeNoRef.current.clear();
        nodeRunIdRef.current.clear();
        portNoRef.current.clear();
        highlightTimeoutsRef.current.forEach(id => window.clearTimeout(id));
        highlightTimeoutsRef.current.clear();
    }, [currentFlowId]);

    const getLastLocalUpdateTimestamp = useCallback(
        () => lastLocalUpdateTimestampRef.current,
        [lastLocalUpdateTimestampRef]
    );

    return {
        handleFlowUpdate,
        handleNodeUpdate,
        handlePortUpdate,
        handleTraceUpdate,
        getLastLocalUpdateTimestamp,
        lastLocalUpdateTimestampRef,
    };
};
