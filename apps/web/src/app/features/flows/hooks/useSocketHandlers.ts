import { useCallback, useEffect, useRef } from 'react';

import { toast } from 'sonner';

import { EXECUTE_FUNCTIONS, getNode, getPortData, useCanvasStore } from '@flows/flows';

import type { WorkflowCanvasRef } from '../components/WorkflowCanvas';
import type { BlockDefinitionWithFrontend } from '@flows/flows';
import type {
    LogTraceEntryInfo,
    NodeUpdateInfo,
    PortUpdateInfo,
    ProgressUpdateInfo,
    TraceUpdateInfo,
} from '@flows/socket';
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
    const portRunIdRef = useRef<Map<string, string>>(new Map());
    const progressSeqRef = useRef<Map<string, number>>(new Map());
    const highlightTimeoutsRef = useRef<Map<string, number>>(new Map());
    const lastLocalUpdateTimestampRef = useRef<number | null>(null);

    const appendTraceLog = useCanvasStore(state => state.appendTraceLog);
    const clearTraceLogs = useCanvasStore(state => state.clearTraceLogs);
    const setUpdatedPort = useCanvasStore(state => state.setUpdatedPort);
    const clearUpdatedPort = useCanvasStore(state => state.clearUpdatedPort);
    const beginRun = useCanvasStore(state => state.beginRun);
    const appendRunTrace = useCanvasStore(state => state.appendRunTrace);
    const appendRunPortUpdate = useCanvasStore(state => state.appendRunPortUpdate);
    const finalizeRun = useCanvasStore(state => state.finalizeRun);

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

            // Reset sequence tracking and node state when runId changes (new execution run)
            // Without this, state priority (COMPLETED > RUNNING) blocks re-execution updates
            const { runId } = info;
            if (runId) {
                const prevRunId = nodeRunIdRef.current.get(nodeId);
                if (prevRunId && prevRunId !== runId) {
                    nodeNoRef.current.delete(nodeId);
                    // progress seq is per-run: a new run's reporter restarts at low seq
                    progressSeqRef.current.delete(nodeId);
                    canvasRef.current?.updateNodeFromServer(nodeId, { state: 'IDLE', status: 'IDLE' }, { force: true });
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

            if (runId) {
                if (stage === 'enter' || (state === 'RUNNING' && !stage)) {
                    beginRun(runId, nodeId, Date.now());
                }
                if (state === 'COMPLETED' || state === 'ERROR') {
                    finalizeRun(runId, nodeId, state, Date.now(), error);
                }
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
        [blockRegistry, currentFlowId, clearTraceLogs, beginRun, finalizeRun, canvasRef]
    );

    const handlePortUpdate = useCallback(
        async (info: PortUpdateInfo) => {
            const { portId, nodeId, flowId, portName, no, runId, ts } = info;

            if (flowId && flowId !== currentFlowId) return;

            if (runId && no !== undefined) {
                appendRunPortUpdate(runId, nodeId, {
                    portId,
                    portName,
                    no,
                    timestamp: Date.now(),
                });
            }

            // Reset port sequence tracking when runId changes (new execution run)
            if (runId) {
                const prevRunId = portRunIdRef.current.get(portId);
                if (prevRunId !== runId) {
                    portNoRef.current.delete(portId);
                    portRunIdRef.current.set(portId, runId);
                }
            }

            if (no !== undefined) {
                const prevNo = portNoRef.current.get(portId);
                // ts = server signals fresh data, skip dedup
                if (!ts && prevNo !== undefined && prevNo >= no) return;
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
                const portData = await getPortData(portId, direction, { flowId, runId });
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
        [setUpdatedPort, clearUpdatedPort, appendRunPortUpdate, blockRegistry, currentFlowId, canvasRef]
    );

    const handleProgressUpdate = useCallback(
        (info: ProgressUpdateInfo) => {
            const { nodeId, status, percent, step, totalSteps, label, error, seq, ts, product$ } = info;

            // Last-write-wins: drop stale snapshots (seq is epoch-based across server invocations)
            const prevSeq = progressSeqRef.current.get(nodeId);
            if (prevSeq !== undefined && seq <= prevSeq) return;
            progressSeqRef.current.set(nodeId, seq);

            if (!canvasRef.current) return;

            const state = status === 'done' ? 'COMPLETED' : status === 'error' ? 'ERROR' : 'RUNNING';
            const progress = percent ?? (step && totalSteps ? Math.round((step / totalSteps) * 100) : undefined);

            // Merge streamed product view into the block's out data (live deploy state from codes-goods-api)
            const node = canvasRef.current.getWorkflow()?.nodes?.find(n => n.id === nodeId);
            const prevOut = node?.outputData?.['out']?.value;
            const outValue =
                product$ && typeof prevOut === 'object' && prevOut !== null
                    ? { ...(prevOut as Record<string, unknown>), ...product$ }
                    : product$;

            canvasRef.current.updateNodeFromServer(nodeId, {
                state,
                status: state,
                ...(error ? { error, errorMessage: error } : {}),
                ...(progress !== undefined ? { executionStats: { progress } } : {}),
                ...(outValue
                    ? { outputData: { out: { value: outValue, type: 'json', timestamp: ts ?? Date.now() } } }
                    : {}),
            });

            if (state === 'ERROR') {
                const displayName = getNodeDisplayName(nodeId, canvasRef, blockRegistry);
                toast.error(`${displayName} failed`, {
                    description: error ? String(error).slice(0, 80) : label,
                    duration: 8000,
                });
            }
            // ponytail: no success toast here — node COMPLETED events already toast; avoids duplicates.
        },
        [blockRegistry, canvasRef]
    );

    const handleLogTrace = useCallback(
        (info: LogTraceEntryInfo) => {
            const { nodeId, level, message, ts, seq, json } = info;
            appendTraceLog(nodeId, {
                seq: seq ?? 0,
                ts: ts ?? Date.now(),
                stage: level,
                message,
                data: json,
            });
        },
        [appendTraceLog]
    );

    const handleTraceUpdate = useCallback(
        (info: TraceUpdateInfo) => {
            const { nodeId, seq, ts, stage, message, runId, data } = info;
            appendTraceLog(nodeId, { seq, ts, stage, message, runId, data });
            if (runId) {
                appendRunTrace(runId, nodeId, { seq, ts, stage, message, runId, data });
            }
        },
        [appendTraceLog, appendRunTrace]
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
        portRunIdRef.current.clear();
        progressSeqRef.current.clear();
        highlightTimeoutsRef.current.forEach(id => window.clearTimeout(id));
        highlightTimeoutsRef.current.clear();
    }, [currentFlowId]);

    const getLastLocalUpdateTimestamp = useCallback(
        () => lastLocalUpdateTimestampRef.current,
        [lastLocalUpdateTimestampRef]
    );

    const resetSequenceTracking = useCallback(() => {
        nodeNoRef.current.clear();
        nodeRunIdRef.current.clear();
        portNoRef.current.clear();
        portRunIdRef.current.clear();
        progressSeqRef.current.clear();
    }, []);

    return {
        handleFlowUpdate,
        handleNodeUpdate,
        handlePortUpdate,
        handleTraceUpdate,
        handleProgressUpdate,
        handleLogTrace,
        getLastLocalUpdateTimestamp,
        lastLocalUpdateTimestampRef,
        resetSequenceTracking,
    };
};
