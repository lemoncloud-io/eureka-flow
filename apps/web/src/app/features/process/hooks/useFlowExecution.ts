import { useCallback, useEffect, useRef, useState } from 'react';

import { loadFlow, runFlow, useAddNoteMutation } from '@flows/flows';

export interface FlowExecutionState {
    status: 'idle' | 'loading' | 'running' | 'completed' | 'error';
    error?: string;
}

const POLL_INTERVAL = 3000;
const POLL_TIMEOUT = 60000;

export const useFlowExecution = (stageId: string) => {
    const [state, setState] = useState<FlowExecutionState>({ status: 'idle' });
    const { mutate: addNote } = useAddNoteMutation();
    const abortRef = useRef(false);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            abortRef.current = true;
        };
    }, []);

    const createNote = useCallback(
        (content: string, stereo: 'comment' | 'issue' = 'comment') => {
            if (!stageId) return;
            addNote({ stageId, input: { content, stereo } });
        },
        [addNote, stageId]
    );

    const execute = useCallback(
        async (flowId: string) => {
            if (!stageId) return;
            abortRef.current = false;
            setState({ status: 'loading' });

            try {
                // 1. Load flow to get nodes + edges
                const flowData = await loadFlow(flowId);
                const allNodeIds = flowData.nodes?.map(n => n.id).filter(Boolean) as string[];

                if (!allNodeIds.length) {
                    setState({ status: 'error', error: 'No nodes found in flow' });
                    createNote('Flow 실행 실패: 노드가 없습니다.', 'issue');
                    return;
                }

                // Find input nodes (nodes with no incoming edges)
                const targetNodeIds = new Set(flowData.edges?.map(e => e.targetNodeId).filter(Boolean) ?? []);
                const inputNodeIds = allNodeIds.filter(id => !targetNodeIds.has(id));
                const nodeIdsToRun = inputNodeIds.length > 0 ? inputNodeIds : [allNodeIds[0]];

                // 2. Run flow
                setState({ status: 'running' });
                await runFlow(flowId, nodeIdsToRun);

                // 3. Poll for completion
                const startTime = Date.now();
                while (!abortRef.current) {
                    if (Date.now() - startTime > POLL_TIMEOUT) {
                        setState({ status: 'error', error: 'Execution timed out' });
                        createNote('Flow 실행 시간 초과', 'issue');
                        return;
                    }

                    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
                    if (abortRef.current) return;

                    try {
                        const updated = await loadFlow(flowId);
                        const nodes = updated.nodes ?? [];
                         
                        const getStatus = (n: { status?: string; state?: string }) =>
                            (n.status ?? n.state ?? '') as string;

                        const hasRunning = nodes.some(n => getStatus(n) === 'RUNNING');
                        const hasError = nodes.some(n => getStatus(n) === 'ERROR');
                        const allDone =
                            nodes.length > 0 &&
                            nodes.every(n => {
                                const s = getStatus(n);
                                return s === 'COMPLETED';
                            });

                        if (hasError) {
                            const errorNode = nodes.find(n => getStatus(n) === 'ERROR');
                            setState({ status: 'error', error: `Node "${errorNode?.name ?? 'unknown'}" failed` });
                            createNote(`Flow 실행 실패: ${errorNode?.name ?? 'unknown'} 노드에서 오류 발생`, 'issue');
                            return;
                        }

                        if (allDone && !hasRunning) {
                            setState({ status: 'completed' });
                            createNote(`Flow 실행 완료. [/flows/${flowId} 결과 보기]`);
                            return;
                        }
                    } catch {
                        setState({ status: 'error', error: 'Failed to check execution status' });
                        createNote('Flow 실행 상태 확인 실패', 'issue');
                        return;
                    }
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                setState({ status: 'error', error: message });
                createNote(`Flow 실행 실패: ${message}`, 'issue');
            }
        },
        [createNote, stageId]
    );

    const reset = useCallback(() => {
        abortRef.current = true;
        setState({ status: 'idle' });
    }, []);

    return { ...state, execute, reset };
};
