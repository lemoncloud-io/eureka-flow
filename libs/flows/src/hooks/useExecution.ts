import { useCallback } from 'react';

import { runFlow as apiRunFlow, stopFlow as apiStopFlow } from '../api';
import { useCanvasStore } from '../stores/useCanvasStore';
import { useFlowsStore } from '../stores/useFlowsStore';

import type { FlowView, InputOverrideItem } from '../types';

/**
 * Hook for managing flow execution
 */
export const useExecution = () => {
    const { executionStatus, activeRunId, startExecution, stopExecution, setExecutionStatus } = useFlowsStore();

    const { flowId, nodes, setNodes } = useCanvasStore();

    /**
     * Run flow execution starting from a specific node
     */
    const runFlow = useCallback(
        async (
            nodeId: string,
            options?: {
                propagate?: boolean;
                inputOverrides?: InputOverrideItem[];
            }
        ): Promise<FlowView | null> => {
            if (!flowId) {
                console.error('No flow ID set');
                return null;
            }

            if (executionStatus === 'running') {
                console.warn('Flow is already running');
                return null;
            }

            try {
                // Update local node status to RUNNING
                setNodes(prev =>
                    prev.map(n =>
                        n.id === nodeId
                            ? {
                                  ...n,
                                  status: 'RUNNING',
                                  errorMessage: undefined,
                                  executionStats: {
                                      startTime: Date.now(),
                                      progress: 0,
                                  },
                              }
                            : n
                    )
                );

                // Start execution via API
                const result = await apiRunFlow(flowId, nodeId, options);

                // Update store with run ID
                if (result.activeRunId) {
                    startExecution(result.activeRunId);
                } else {
                    setExecutionStatus('running');
                }

                return result;
            } catch (error) {
                console.error('Failed to run flow:', error);

                // Update node status to ERROR
                setNodes(prev =>
                    prev.map(n =>
                        n.id === nodeId
                            ? {
                                  ...n,
                                  status: 'ERROR',
                                  errorMessage: error instanceof Error ? error.message : 'Unknown error',
                              }
                            : n
                    )
                );

                setExecutionStatus('error');
                return null;
            }
        },
        [flowId, executionStatus, setNodes, startExecution, setExecutionStatus]
    );

    /**
     * Stop flow execution
     */
    const stopFlowExecution = useCallback(
        async (nodeId?: string): Promise<FlowView | null> => {
            if (!flowId) {
                console.error('No flow ID set');
                return null;
            }

            try {
                const result = await apiStopFlow(flowId, nodeId);

                // Update local state
                stopExecution();

                // Reset running nodes to IDLE
                setNodes(prev =>
                    prev.map(n =>
                        n.status === 'RUNNING'
                            ? {
                                  ...n,
                                  status: 'IDLE',
                                  executionStats: undefined,
                              }
                            : n
                    )
                );

                return result;
            } catch (error) {
                console.error('Failed to stop flow:', error);
                return null;
            }
        },
        [flowId, stopExecution, setNodes]
    );

    /**
     * Run all entry point nodes (nodes without inputs)
     */
    const runAll = useCallback(async (): Promise<void> => {
        if (!flowId) {
            console.error('No flow ID set');
            return;
        }

        // Find entry point nodes (no incoming connections or no required inputs)
        const entryNodes = nodes.filter(n => {
            // TODO: Check if node has required inputs that are not connected
            const hasNoInputConnections = !nodes.some(other => nodes.find(node => node.id === other.id));
            return !n.disabled && (hasNoInputConnections || n.type?.startsWith('input-'));
        });

        if (entryNodes.length === 0) {
            console.warn('No entry point nodes found');
            return;
        }

        // Run each entry node
        for (const node of entryNodes) {
            await runFlow(node.id, { propagate: true });
        }
    }, [flowId, nodes, runFlow]);

    /**
     * Stop all running nodes
     */
    const stopAll = useCallback(async (): Promise<void> => {
        await stopFlowExecution();
    }, [stopFlowExecution]);

    /**
     * Check if a specific node is running
     */
    const isNodeRunning = useCallback(
        (nodeId: string): boolean => {
            const node = nodes.find(n => n.id === nodeId);
            return node?.status === 'RUNNING';
        },
        [nodes]
    );

    /**
     * Check if any node is running
     */
    const isAnyNodeRunning = useCallback((): boolean => {
        return nodes.some(n => n.status === 'RUNNING');
    }, [nodes]);

    return {
        // State
        executionStatus,
        activeRunId,
        isRunning: executionStatus === 'running',

        // Actions
        runFlow,
        stopFlowExecution,
        runAll,
        stopAll,

        // Utilities
        isNodeRunning,
        isAnyNodeRunning,
    };
};
