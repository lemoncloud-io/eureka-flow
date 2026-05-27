import { useCallback, useEffect, useRef } from 'react';

import { toast } from 'sonner';

import {
    EXECUTE_FUNCTIONS,
    getPortData,
    useCanvasStore,
    useFlows,
    useFlowsStore,
    useProductProgressStore,
} from '@flows/flows';
import { useInitFlowSocket } from '@flows/socket';

import { executeNodeWithToast } from '../utils';

import type { SerializeWorkflowFn } from './types';
import type { NodeState } from '@flows/flows';
import type {
    NodeUpdateInfo,
    PortUpdateInfo,
    ProductProgressInfo,
    TraceUpdateInfo,
    WebSocketMessage,
} from '@flows/socket';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

interface UseMobileSocketSyncParams {
    serializeWorkflowState: SerializeWorkflowFn;
    lastSavedStateRef: React.MutableRefObject<string | null>;
    lastLocalUpdateTimestampRef: React.MutableRefObject<number | null>;
    canEdit?: boolean;
    onMessage?: (message: WebSocketMessage) => void;
}

interface UseMobileSocketSyncReturn {
    isSocketConnected: boolean;
    socketConnectionId: string | undefined;
    replayMessage: (message: WebSocketMessage) => void;
}

export const useMobileSocketSync = ({
    serializeWorkflowState,
    lastSavedStateRef,
    lastLocalUpdateTimestampRef,
    canEdit = false,
    onMessage,
}: UseMobileSocketSyncParams): UseMobileSocketSyncReturn => {
    const { currentFlowId, channelId, loadFlowById } = useFlows();

    // RunContext store actions
    const beginRun = useCanvasStore(state => state.beginRun);
    const appendRunTrace = useCanvasStore(state => state.appendRunTrace);
    const appendRunPortUpdate = useCanvasStore(state => state.appendRunPortUpdate);
    const finalizeRun = useCanvasStore(state => state.finalizeRun);
    const appendTraceLog = useCanvasStore(state => state.appendTraceLog);
    const clearTraceLogs = useCanvasStore(state => state.clearTraceLogs);

    const nodeNoRef = useRef<Map<string, number>>(new Map());
    const nodeRunIdRef = useRef<Map<string, string>>(new Map());
    const portNoRef = useRef<Map<string, number>>(new Map());
    const connectionIdRef = useRef<string | undefined>();
    const pendingAutoExecRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleFlowUpdate = useCallback(
        async (flowId: string) => {
            try {
                const flowData = await loadFlowById(flowId);
                if (flowData) {
                    useCanvasStore.getState().loadWorkflow(flowData);
                    lastSavedStateRef.current = serializeWorkflowState(flowData);
                }
            } catch (error) {
                console.error('[MobileFlowEditor] Failed to reload flow:', error);
            }
        },
        [loadFlowById, lastSavedStateRef, serializeWorkflowState]
    );

    const handleNodeUpdate = useCallback(
        async (info: NodeUpdateInfo) => {
            const { nodeId, flowId, state, no, stage, error, runId } = info;

            if (flowId && flowId !== currentFlowId) return;

            // Reset sequence tracking when runId changes (new execution run)
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

            // Clear trace logs on new execution start
            if (state === 'RUNNING' && no !== undefined && no <= 1) {
                clearTraceLogs(nodeId);
            }

            // Track execution history via RunContext
            if (runId) {
                if (stage === 'enter' || (state === 'RUNNING' && !stage)) {
                    beginRun(runId, nodeId, Date.now());
                }
                if (state === 'COMPLETED' || state === 'ERROR') {
                    finalizeRun(runId, nodeId, state, Date.now(), error);
                }
            }

            const storeState = useCanvasStore.getState();
            const { updateNodeData, nodes } = storeState;

            if (state === 'ERROR') {
                updateNodeData(nodeId, {
                    state: state as NodeState,
                    error,
                } as Partial<NodeData>);
                toast.error(`Node ${nodeId} failed`);
                return;
            }

            if (state) {
                updateNodeData(nodeId, { state: state as NodeState } as Partial<NodeData>);
            }

            if (state === 'COMPLETED') {
                toast.success(`Node completed`, { duration: 3000 });
            }

            // Auto-execute READY frontend nodes (same as desktop useSocketHandlers)
            if (state === 'READY') {
                const node = nodes.find(n => n.id === nodeId);
                if (!node?.type) return;

                const nodeDef = useFlowsStore.getState().blockRegistry[node.type];
                if (!nodeDef?.isFrontend || !EXECUTE_FUNCTIONS[nodeDef.type]) return;
                if (nodeDef.stereo === 'input') return;

                const hasAllInputs = (nodeDef.inputs ?? []).every(
                    input => node.inputData?.[input.id]?.value !== undefined
                );
                if (!hasAllInputs) return;

                pendingAutoExecRef.current = setTimeout(() => {
                    pendingAutoExecRef.current = null;
                    executeNodeWithToast(nodeId, {
                        flowId: currentFlowId,
                        socketConnectionId: connectionIdRef.current,
                        canEdit,
                    });
                }, 0);
            }
        },
        [currentFlowId, clearTraceLogs, beginRun, finalizeRun]
    );

    const handlePortUpdate = useCallback(
        async (info: PortUpdateInfo) => {
            const { portId, nodeId, flowId, portName, direction, no, runId } = info;

            if (flowId && flowId !== currentFlowId) return;

            // Record port update in RunContext before sequence dedup
            if (runId && no !== undefined) {
                appendRunPortUpdate(runId, nodeId, {
                    portId,
                    portName,
                    no,
                    timestamp: Date.now(),
                });
            }

            // Sequence dedup
            if (no !== undefined) {
                const prevNo = portNoRef.current.get(portId);
                if (prevNo !== undefined && prevNo >= no) return;
                portNoRef.current.set(portId, no);
            }

            const isOutputPort = direction === 'out' || portName === 'out';

            // Skip input ports on non-terminal nodes
            if (!isOutputPort) {
                const node = useCanvasStore.getState().nodes.find(n => n.id === nodeId);
                if (node?.type) {
                    const blockDef = useFlowsStore.getState().blockRegistry[node.type];
                    if (blockDef?.output$ && blockDef.output$.length > 0) return;
                }
            }

            const dir = isOutputPort ? 'out' : 'in';

            try {
                const portData = await getPortData(portId, dir);

                // Last-write-wins: skip if a newer message arrived while fetching
                if (no !== undefined && portNoRef.current.get(portId) !== no) return;

                if (portData?.data) {
                    const portKey = portData.portId || portName || dir;
                    const updates = isOutputPort
                        ? { outputData: { [portKey]: portData.data } }
                        : { inputData: { [portKey]: portData.data } };
                    useCanvasStore.getState().updateNodeData(nodeId, updates as Partial<NodeData>);
                }
            } catch (err) {
                if (no !== undefined) {
                    const prevNo = portNoRef.current.get(portId);
                    if (prevNo === no) portNoRef.current.delete(portId);
                }
                console.debug('[MobileSocketSync] Failed to fetch port data:', portId, err);
            }
        },
        [currentFlowId, appendRunPortUpdate]
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

    const setProductProgress = useProductProgressStore(state => state.setProgress);
    const handleProductProgress = useCallback(
        (info: ProductProgressInfo) => setProductProgress(info),
        [setProductProgress]
    );

    const getLastLocalUpdateTimestamp = useCallback(
        () => lastLocalUpdateTimestampRef.current,
        [lastLocalUpdateTimestampRef]
    );

    const { isConnected, connectionId, replayMessage } = useInitFlowSocket({
        channelId,
        currentFlowId,
        getLastLocalUpdateTimestamp,
        onFlowUpdate: handleFlowUpdate,
        onNodeReload: handleNodeUpdate,
        onPortUpdate: handlePortUpdate,
        onTraceUpdate: handleTraceUpdate,
        onProductProgress: handleProductProgress,
        onMessage,
    });
    connectionIdRef.current = connectionId ?? undefined;

    // Clear sequence tracking + pending auto-exec on flow change / unmount
    useEffect(() => {
        nodeNoRef.current.clear();
        nodeRunIdRef.current.clear();
        portNoRef.current.clear();
        if (pendingAutoExecRef.current) {
            clearTimeout(pendingAutoExecRef.current);
            pendingAutoExecRef.current = null;
        }
        return () => {
            if (pendingAutoExecRef.current) {
                clearTimeout(pendingAutoExecRef.current);
                pendingAutoExecRef.current = null;
            }
        };
    }, [currentFlowId]);

    return {
        isSocketConnected: isConnected,
        socketConnectionId: connectionId ?? undefined,
        replayMessage,
    };
};
