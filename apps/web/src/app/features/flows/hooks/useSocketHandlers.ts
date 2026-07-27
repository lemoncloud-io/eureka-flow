import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';

import {
    emptyExecutionState,
    reduceNodeEvent,
    reducePortEvent,
    reduceProgressEvent,
    rollbackNodeCursor,
    rollbackPortCursor,
} from '@flows/engine';
import { EXECUTE_FUNCTIONS, captureBaseline, getNode, getPortData, translateField, useCanvasStore } from '@flows/flows';

import type { WorkflowCanvasRef } from '../components/WorkflowCanvas';
import type { ExecutionState } from '@flows/engine';
import type { BlockDefinitionWithFrontend } from '@flows/flows';
import type {
    LogTraceEntryInfo,
    NodeUpdateInfo,
    PortUpdateInfo,
    ProgressUpdateInfo,
    TraceUpdateInfo,
} from '@flows/socket';
import type { TFunction } from 'i18next';
import type { RefObject } from 'react';

interface UseSocketHandlersParams {
    canvasRef: RefObject<WorkflowCanvasRef | null>;
    blockRegistry: Record<string, BlockDefinitionWithFrontend>;
    currentFlowId: string | null;
    loadFlowById: (flowId: string) => Promise<unknown>;
}

const getNodeDisplayName = (
    nodeId: string,
    canvasRef: RefObject<WorkflowCanvasRef | null>,
    blockRegistry: Record<string, BlockDefinitionWithFrontend>,
    t: TFunction
): string => {
    const node = canvasRef.current?.getWorkflow()?.nodes?.find(n => n.id === nodeId);
    const label = node?.customLabel || (node?.type ? translateField(t, blockRegistry[node.type], 'label') : '');
    return label ? `${label} (${nodeId})` : nodeId;
};

export const useSocketHandlers = ({
    canvasRef,
    blockRegistry,
    currentFlowId,
    loadFlowById,
}: UseSocketHandlersParams) => {
    const { t } = useTranslation(['flows', 'blocks']);
    // Message ordering lives in the engine's reducer now — see `runtime/executionReducer`.
    // It used to be five Maps in here, and none of it had a test.
    const executionRef = useRef<ExecutionState>(emptyExecutionState());
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
                    // Baseline off the canvas, not off flowData: loadWorkflow fills in the
                    // fields the response leaves out, and a baseline that skipped that
                    // normalization would read dirty against a flow nobody has touched.
                    captureBaseline(canvasRef.current.getWorkflow());
                }
            } catch (error) {
                console.error('[FlowEditor] Failed to reload flow:', error);
            }
        },
        [loadFlowById, canvasRef]
    );

    const handleNodeUpdate = useCallback(
        async (info: NodeUpdateInfo) => {
            // The reducer owns ordering: stale sequences, run changes, cross-flow frames.
            // What is left here is the part that needs a browser — toasts, a fetch, a canvas.
            const { state: nextState, effects } = reduceNodeEvent(executionRef.current, info, { currentFlowId });
            executionRef.current = nextState;
            if (!canvasRef.current) return;

            // Filled by the fetch effect, which the reducer emits before the patch it belongs to.
            let fetchedError: string | undefined;

            for (const effect of effects) {
                switch (effect.type) {
                    case 'reset-node':
                        canvasRef.current.updateNodeFromServer(
                            effect.nodeId,
                            { state: 'IDLE', status: 'IDLE' },
                            { force: true }
                        );
                        break;

                    case 'clear-traces':
                        clearTraceLogs(effect.nodeId);
                        break;

                    case 'run-begin':
                        beginRun(effect.runId, effect.nodeId, Date.now());
                        break;

                    case 'run-end':
                        finalizeRun(effect.runId, effect.nodeId, effect.state, Date.now(), effect.error);
                        break;

                    case 'fetch-error-detail':
                        try {
                            const nodeData = await getNode(effect.nodeId);
                            fetchedError = nodeData.error ?? nodeData.errorMessage;
                        } catch {
                            // Give the sequence back so the server's next attempt is not
                            // mistaken for a stale frame and dropped.
                            if (info.no !== undefined) {
                                executionRef.current = rollbackNodeCursor(executionRef.current, effect.nodeId, info.no);
                            }
                        }
                        break;

                    case 'apply':
                        canvasRef.current.updateNodeFromServer(effect.nodeId, {
                            ...effect.patch,
                            ...(fetchedError === undefined ? {} : { error: fetchedError, errorMessage: fetchedError }),
                        });
                        break;

                    case 'notify': {
                        const displayName = getNodeDisplayName(effect.nodeId, canvasRef, blockRegistry, t);
                        const detail = fetchedError ?? effect.message;
                        if (effect.level === 'error') {
                            toast.error(`${displayName} failed`, {
                                description: detail ? String(detail).slice(0, 80) : undefined,
                                duration: 8000,
                            });
                        } else {
                            toast.success(`${displayName} completed`, { duration: 4000 });
                        }
                        break;
                    }

                    case 'maybe-autorun': {
                        // Frontend blocks run in the browser, so only the browser can decide
                        // whether this one is ready to.
                        const node = canvasRef.current.getWorkflow()?.nodes?.find(n => n.id === effect.nodeId);
                        if (!node?.type) break;
                        const nodeDef = blockRegistry[node.type];
                        if (!nodeDef?.isFrontend || !EXECUTE_FUNCTIONS[nodeDef.type]) break;
                        if (nodeDef.stereo === 'input') break;
                        const hasAllInputs = (nodeDef.inputs ?? []).every(
                            input => node.inputData?.[input.id]?.value !== undefined
                        );
                        if (!hasAllInputs) break;
                        setTimeout(() => canvasRef.current?.executeNode(effect.nodeId), 0);
                        break;
                    }

                    default:
                        break;
                }
            }
        },
        [blockRegistry, currentFlowId, clearTraceLogs, beginRun, finalizeRun, canvasRef, t]
    );

    const handlePortUpdate = useCallback(
        async (info: PortUpdateInfo) => {
            const { portId, nodeId, flowId, portName, no, runId } = info;

            if (runId && no !== undefined) {
                appendRunPortUpdate(runId, nodeId, {
                    portId,
                    portName,
                    no,
                    timestamp: Date.now(),
                });
            }

            // Cross-flow frames, run changes and stale sequences — including the `ts`
            // freshness override — are the reducer's call.
            const { state: nextState, effects } = reducePortEvent(executionRef.current, info, { currentFlowId });
            executionRef.current = nextState;
            if (effects.length === 0) return;

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
                // Give the sequence back, or the server's resend reads as stale and the
                // port never fills in.
                if (no !== undefined) {
                    executionRef.current = rollbackPortCursor(executionRef.current, portId, no);
                }
                console.debug('[handlePortUpdate] Failed to fetch port data:', portId, err);
            }
        },
        [setUpdatedPort, clearUpdatedPort, appendRunPortUpdate, blockRegistry, currentFlowId, canvasRef]
    );

    const handleProgressUpdate = useCallback(
        (info: ProgressUpdateInfo) => {
            const { nodeId, label, error, ts, product$ } = info;

            // Last-write-wins on an epoch-based seq — the reducer holds the watermark, and
            // resets it when a new run starts so the next reporter is not swallowed.
            const { state: nextState, effects } = reduceProgressEvent(executionRef.current, info);
            executionRef.current = nextState;
            const patch = effects.find(effect => effect.type === 'apply')?.patch;
            if (!patch || !canvasRef.current) return;

            const state = patch.state;

            // Merge streamed product view into the block's out data (live deploy state from codes-goods-api)
            const node = canvasRef.current.getWorkflow()?.nodes?.find(n => n.id === nodeId);
            const prevOut = node?.outputData?.['out']?.value;
            const outValue =
                product$ && typeof prevOut === 'object' && prevOut !== null
                    ? { ...(prevOut as Record<string, unknown>), ...product$ }
                    : product$;

            canvasRef.current.updateNodeFromServer(nodeId, {
                ...patch,
                ...(error ? { error, errorMessage: error } : {}),
                ...(outValue
                    ? { outputData: { out: { value: outValue, type: 'json', timestamp: ts ?? Date.now() } } }
                    : {}),
            });

            if (state === 'ERROR') {
                const displayName = getNodeDisplayName(nodeId, canvasRef, blockRegistry, t);
                toast.error(`${displayName} failed`, {
                    description: error ? String(error).slice(0, 80) : label,
                    duration: 8000,
                });
            }
            // ponytail: no success toast here — node COMPLETED events already toast; avoids duplicates.
        },
        [blockRegistry, canvasRef, t]
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
        executionRef.current = emptyExecutionState();
        highlightTimeoutsRef.current.forEach(id => window.clearTimeout(id));
        highlightTimeoutsRef.current.clear();
    }, [currentFlowId]);

    const getLastLocalUpdateTimestamp = useCallback(
        () => lastLocalUpdateTimestampRef.current,
        [lastLocalUpdateTimestampRef]
    );

    const resetSequenceTracking = useCallback(() => {
        executionRef.current = emptyExecutionState();
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
