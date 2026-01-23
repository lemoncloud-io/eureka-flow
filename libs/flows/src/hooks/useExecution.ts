import { useCallback, useEffect, useRef } from 'react';

import { requiresBackendProcessing, runNode } from '../api';
import { useCanvasStore } from '../stores/useCanvasStore';
import { useFlowsStore } from '../stores/useFlowsStore';

import type { NodeView, doPostRunBody } from '../types';
import type { DataPacket, NodeData } from '@lemoncloud/eureka-flows-api';

/**
 * Convert node config (Record<string, string>) to doPostRunBody format
 */
const buildRunNodeBody = (config: Record<string, string> | undefined): doPostRunBody => {
    return { config$: config };
};

/**
 * Hook for managing flow execution
 *
 * Execution state is managed at NODE level:
 * - Each node has its own `status` (IDLE/RUNNING/COMPLETED/ERROR)
 * - autoExecutionEnabled: enables reactive chain execution
 * - inputData.timestamp change triggers auto-execution
 */
export const useExecution = () => {
    const { nodes, connections, setNodes } = useCanvasStore();
    const blockRegistry = useFlowsStore(state => state.blockRegistry);
    const prevInputTimestampsRef = useRef<Record<string, Record<string, number>>>({});

    /**
     * Get downstream nodes connected to a given node's output
     */
    const getDownstreamNodes = useCallback(
        (nodeId: string): Array<{ node: NodeData; targetPortId: string; sourcePortId: string }> => {
            const outgoingConnections = connections.filter(c => c.sourceNodeId === nodeId);
            return outgoingConnections
                .map(conn => {
                    const node = nodes.find(n => n.id === conn.targetNodeId);
                    return node ? { node, targetPortId: conn.targetPortId, sourcePortId: conn.sourcePortId } : null;
                })
                .filter((item): item is { node: NodeData; targetPortId: string; sourcePortId: string } => !!item);
        },
        [nodes, connections]
    );

    /**
     * Propagate output data to connected downstream nodes
     */
    const propagateOutputToDownstream = useCallback(
        (nodeId: string, outputData: Record<string, DataPacket>) => {
            const downstreamNodes = getDownstreamNodes(nodeId);

            setNodes(prev =>
                prev.map(n => {
                    const downstream = downstreamNodes.find(d => d.node.id === n.id);
                    if (!downstream) return n;

                    // Get the output data for the source port
                    const sourceData = outputData[downstream.sourcePortId];
                    if (!sourceData) return n;

                    // Update inputData with new timestamp to trigger reactive execution
                    const newInputData = {
                        ...n.inputData,
                        [downstream.targetPortId]: {
                            ...sourceData,
                            timestamp: Date.now(),
                        },
                    };

                    return { ...n, inputData: newInputData };
                })
            );
        },
        [getDownstreamNodes, setNodes]
    );

    /**
     * Run a single node
     *
     * Execution strategy:
     * - Frontend-only blocks: Execute locally using block.execute()
     * - Backend-required blocks: Call POST /nodes/:id/run API
     */
    const executeNode = useCallback(
        async (nodeId: string): Promise<void> => {
            const node = nodes.find(n => n.id === nodeId);
            if (!node || node.disabled) return;

            const blockType = node.type;
            const blockDef = blockType ? blockRegistry[blockType] : null;

            // Set node status to RUNNING
            setNodes(prev =>
                prev.map(n =>
                    n.id === nodeId
                        ? {
                              ...n,
                              status: 'RUNNING',
                              errorMessage: undefined,
                              executionStats: { startTime: Date.now(), progress: 0 },
                          }
                        : n
                )
            );

            try {
                let outputData: Record<string, DataPacket> | undefined;

                // Check if block can be executed on frontend
                const canExecuteLocally = blockDef?.execute && !requiresBackendProcessing(blockType || '');

                if (canExecuteLocally && blockDef?.execute) {
                    // Frontend execution: call block.execute() directly
                    console.log(`[useExecution] Frontend execution: ${blockType}`);

                    const onProgress = (progress: number) => {
                        setNodes(prev =>
                            prev.map(n =>
                                n.id === nodeId ? { ...n, executionStats: { ...n.executionStats, progress } } : n
                            )
                        );
                    };

                    outputData = await blockDef.execute(node.inputData || {}, node.config || {}, onProgress);

                    // Update node with output data
                    setNodes(prev =>
                        prev.map(n =>
                            n.id === nodeId
                                ? {
                                      ...n,
                                      status: 'COMPLETED' as const,
                                      outputData: outputData || {},
                                      executionStats: {
                                          ...n.executionStats,
                                          duration: Date.now() - (n.executionStats?.startTime || Date.now()),
                                          progress: 100,
                                      },
                                  }
                                : n
                        )
                    );
                } else {
                    // Backend execution: call API with config
                    console.log(`[useExecution] Backend execution: ${blockType}`);
                    const body = buildRunNodeBody(node.config);
                    await runNode(nodeId, body);

                    // Mark as COMPLETED (backend updates node state)
                    setNodes(prev =>
                        prev.map(n =>
                            n.id === nodeId
                                ? {
                                      ...n,
                                      status: 'COMPLETED',
                                      executionStats: {
                                          ...n.executionStats,
                                          duration: Date.now() - (n.executionStats?.startTime || Date.now()),
                                          progress: 100,
                                      },
                                  }
                                : n
                        )
                    );

                    // Get output from updated node for propagation
                    const updatedNode = nodes.find(n => n.id === nodeId);
                    outputData = updatedNode?.outputData;
                }

                // Propagate output to downstream nodes
                if (outputData) {
                    propagateOutputToDownstream(nodeId, outputData);
                }
            } catch (error) {
                // Mark as ERROR
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
            }
        },
        [nodes, setNodes, blockRegistry, propagateOutputToDownstream]
    );

    /**
     * Run node execution
     * POST /nodes/:nodeId/run
     *
     * @param nodeId - Node ID to execute
     * @param options.async - If true, queues execution via SQS and returns immediately
     */
    const runNodeExecution = useCallback(
        async (nodeId: string, options?: { async?: boolean }): Promise<NodeView | null> => {
            const node = nodes.find(n => n.id === nodeId);
            if (!node) {
                console.error('Node not found:', nodeId);
                return null;
            }

            if (node.status === 'RUNNING') {
                console.warn('Node is already running');
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
                                  executionStats: { startTime: Date.now(), progress: 0 },
                              }
                            : n
                    )
                );

                // Call API: POST /nodes/:nodeId/run with config
                const body = buildRunNodeBody(node.config);
                const result = await runNode(nodeId, body, options);
                return result;
            } catch (error) {
                console.error('Failed to run node:', error);

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

                return null;
            }
        },
        [nodes, setNodes]
    );

    /**
     * Stop execution (local state only)
     *
     * Note: Backend stop endpoint not yet implemented.
     * This only resets local UI state.
     */
    const stopExecution = useCallback(
        (nodeId?: string): void => {
            setNodes(prev =>
                prev.map(n => {
                    if (nodeId && n.id !== nodeId) return n;
                    if (n.status === 'RUNNING') {
                        return { ...n, status: 'IDLE', executionStats: undefined };
                    }
                    return n;
                })
            );
        },
        [setNodes]
    );

    /**
     * Run all entry point nodes (nodes without input connections)
     */
    const runAll = useCallback(async (): Promise<void> => {
        // Find entry point nodes (no incoming connections)
        const nodesWithIncoming = new Set(connections.map(c => c.targetNodeId));
        const entryNodes = nodes.filter(n => !n.disabled && !nodesWithIncoming.has(n.id));

        if (entryNodes.length === 0) {
            console.warn('No entry point nodes found');
            return;
        }

        // Run each entry node (propagation will handle the rest via reactive triggers)
        for (const node of entryNodes) {
            await runNodeExecution(node.id);
        }
    }, [nodes, connections, runNodeExecution]);

    /**
     * Stop all running nodes (local state only)
     */
    const stopAll = useCallback((): void => {
        stopExecution();
    }, [stopExecution]);

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

    /**
     * Toggle autoExecutionEnabled for a node
     */
    const toggleAutoExecution = useCallback(
        (nodeId: string) => {
            setNodes(prev =>
                prev.map(n => (n.id === nodeId ? { ...n, autoExecutionEnabled: !n.autoExecutionEnabled } : n))
            );
        },
        [setNodes]
    );

    /**
     * Reactive Trigger: Watch for inputData.timestamp changes
     * Auto-execute nodes with autoExecutionEnabled when their inputs change
     */
    useEffect(() => {
        nodes.forEach(node => {
            if (!node.autoExecutionEnabled || node.status === 'RUNNING' || node.disabled) {
                return;
            }

            const prevTimestamps = prevInputTimestampsRef.current[node.id] || {};
            const currentTimestamps: Record<string, number> = {};

            // Check each input port for timestamp changes
            Object.entries(node.inputData || {}).forEach(([portId, data]) => {
                currentTimestamps[portId] = data?.timestamp || 0;

                const prevTimestamp = prevTimestamps[portId] || 0;
                const currentTimestamp = data?.timestamp || 0;

                // If timestamp changed and is newer, trigger execution
                if (currentTimestamp > prevTimestamp && prevTimestamp !== 0) {
                    console.log(`[useExecution] Auto-triggering node ${node.id} due to input change`);
                    executeNode(node.id);
                }
            });

            // Update ref for next comparison
            prevInputTimestampsRef.current[node.id] = currentTimestamps;
        });
    }, [nodes, executeNode]);

    return {
        // State (derived from nodes)
        isRunning: isAnyNodeRunning(),

        // Actions
        runNodeExecution,
        stopExecution,
        runAll,
        stopAll,
        executeNode,

        // Utilities
        isNodeRunning,
        isAnyNodeRunning,
        toggleAutoExecution,
        propagateOutputToDownstream,
    };
};
