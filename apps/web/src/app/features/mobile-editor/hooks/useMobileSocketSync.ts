import { useCallback, useEffect, useRef } from 'react';

import { toast } from 'sonner';

import { getPortData, useCanvasStore, useFlows } from '@flows/flows';
import { useInitFlowSocket } from '@flows/socket';

import type { SerializeWorkflowFn } from './types';
import type { NodeState } from '@flows/flows';
import type { NodeUpdateInfo, PortUpdateInfo, TraceUpdateInfo } from '@flows/socket';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

interface UseMobileSocketSyncParams {
    serializeWorkflowState: SerializeWorkflowFn;
    lastSavedStateRef: React.MutableRefObject<string | null>;
    lastLocalUpdateTimestampRef: React.MutableRefObject<number | null>;
}

interface UseMobileSocketSyncReturn {
    isSocketConnected: boolean;
    socketConnectionId: string | undefined;
}

export const useMobileSocketSync = ({
    serializeWorkflowState,
    lastSavedStateRef,
    lastLocalUpdateTimestampRef,
}: UseMobileSocketSyncParams): UseMobileSocketSyncReturn => {
    const { currentFlowId, channelId, loadFlowById } = useFlows();

    const nodeNoRef = useRef<Map<string, number>>(new Map());
    const portNoRef = useRef<Map<string, number>>(new Map());

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
            const { nodeId, flowId, state, no, error } = info;

            // Node messages may omit flowId — channel subscription already filters by flow
            if (flowId && flowId !== currentFlowId) return;

            if (no !== undefined) {
                const prevNo = nodeNoRef.current.get(nodeId);
                if (prevNo !== undefined && prevNo >= no) return;
                nodeNoRef.current.set(nodeId, no);
            }

            const { updateNodeData } = useCanvasStore.getState();

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
        },
        [currentFlowId]
    );

    const handlePortUpdate = useCallback(
        async (info: PortUpdateInfo) => {
            const { portId, nodeId, flowId, portName, no } = info;

            // Port messages may omit flowId — channel subscription already filters by flow
            if (flowId && flowId !== currentFlowId) return;

            // Sequence dedup
            if (no !== undefined) {
                const prevNo = portNoRef.current.get(portId);
                if (prevNo !== undefined && prevNo >= no) return;
                portNoRef.current.set(portId, no);
            }

            // Fetch port data and update node in canvas store
            const isOutputPort = portName === 'out';
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
                    useCanvasStore.getState().updateNodeData(nodeId, updates as Partial<NodeData>);
                }
            } catch (err) {
                // Roll back sequence tracking so retry can succeed
                if (no !== undefined) {
                    const prevNo = portNoRef.current.get(portId);
                    if (prevNo === no) portNoRef.current.delete(portId);
                }
                console.debug('[MobileSocketSync] Failed to fetch port data:', portId, err);
            }
        },
        [currentFlowId]
    );

    const handleTraceUpdate = useCallback((info: TraceUpdateInfo) => {
        useCanvasStore.getState().appendTraceLog(info.nodeId, {
            seq: info.seq,
            ts: info.ts,
            stage: info.stage,
            message: info.message,
            runId: info.runId,
            data: info.data,
        });
    }, []);

    const getLastLocalUpdateTimestamp = useCallback(
        () => lastLocalUpdateTimestampRef.current,
        [lastLocalUpdateTimestampRef]
    );

    const { isConnected, connectionId } = useInitFlowSocket({
        channelId,
        currentFlowId,
        getLastLocalUpdateTimestamp,
        onFlowUpdate: handleFlowUpdate,
        onNodeReload: handleNodeUpdate,
        onPortUpdate: handlePortUpdate,
        onTraceUpdate: handleTraceUpdate,
    });

    // Clear sequence tracking on flow change
    useEffect(() => {
        nodeNoRef.current.clear();
        portNoRef.current.clear();
    }, [currentFlowId]);

    return {
        isSocketConnected: isConnected,
        socketConnectionId: connectionId ?? undefined,
    };
};
