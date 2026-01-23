import { useCallback, useEffect, useRef } from 'react';

import { requiresBackendProcessing, runNode } from '@flows/flows';

import type { BlockDefinition, Connection, DataPacket, NodeData, PortDefinition } from '@lemoncloud/eureka-flows-api';

interface UseNodeExecutionOptions {
    readOnly?: boolean;
    blockRegistry: Record<string, BlockDefinition>;
    nodes: NodeData[];
    connections: Connection[];
    setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
    onError?: (nodeId: string, error: string) => void;
}

interface UseNodeExecutionReturn {
    executeNode: (nodeId: string, manualOverrideInputs?: Record<string, DataPacket>) => Promise<void>;
    executeAllFromStart: () => Promise<void>;
    stopExecution: () => void;
    isExecuting: boolean;
    propagateOutputs: (sourceNodeId: string, outputs: Record<string, DataPacket>) => void;
}

export const useNodeExecution = (options: UseNodeExecutionOptions): UseNodeExecutionReturn => {
    const { readOnly = false, blockRegistry, nodes, connections, setNodes, onError } = options;

    // Use refs to avoid recreating callbacks when nodes/connections change
    const nodesRef = useRef(nodes);
    const connectionsRef = useRef(connections);
    nodesRef.current = nodes;
    connectionsRef.current = connections;

    const nodeInputHashesRef = useRef<Map<string, string>>(new Map());
    const isExecutingRef = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    const propagateOutputs = useCallback(
        (sourceNodeId: string, outputs: Record<string, DataPacket>) => {
            const relevantConnections = connectionsRef.current.filter(c => c.sourceNodeId === sourceNodeId);
            if (relevantConnections.length === 0) return;

            setNodes(prevNodes => {
                let hasChanges = false;
                const nextNodes = prevNodes.map(node => {
                    const incoming = relevantConnections.filter(c => c.targetNodeId === node.id);
                    if (incoming.length === 0) return node;

                    const newInputData = { ...node.inputData };
                    let nodeChanged = false;

                    incoming.forEach(conn => {
                        const packet = outputs[conn.sourcePortId];
                        if (packet) {
                            newInputData[conn.targetPortId] = packet;
                            nodeChanged = true;
                        }
                    });

                    if (nodeChanged) {
                        hasChanges = true;
                        return { ...node, inputData: newInputData };
                    }
                    return node;
                });
                return hasChanges ? nextNodes : prevNodes;
            });
        },
        [setNodes]
    );

    const executeNode = useCallback(
        async (nodeId: string, manualOverrideInputs?: Record<string, DataPacket>) => {
            if (readOnly) return;

            const startTime = Date.now();

            setNodes(prev =>
                prev.map(n =>
                    n.id === nodeId
                        ? {
                              ...n,
                              status: 'RUNNING' as const,
                              errorMessage: undefined,
                              executionStats: {
                                  startTime,
                                  progress: 0,
                                  duration: 0,
                              },
                          }
                        : n
                )
            );

            const currentNode = nodesRef.current.find(n => n.id === nodeId);
            if (!currentNode) return;

            const inputs = manualOverrideInputs || currentNode.inputData;
            const nodeDef = blockRegistry[currentNode.type];

            if (!nodeDef) {
                setNodes(prev =>
                    prev.map(n =>
                        n.id === nodeId ? { ...n, status: 'ERROR' as const, errorMessage: 'Unknown block type' } : n
                    )
                );
                onError?.(nodeId, 'Unknown block type');
                return;
            }

            const onProgress = (progress: number) => {
                setNodes(prev =>
                    prev.map(n =>
                        n.id === nodeId
                            ? {
                                  ...n,
                                  executionStats: {
                                      ...n.executionStats,
                                      progress: Math.min(Math.max(progress, 0), 100),
                                  },
                              }
                            : n
                    )
                );
            };

            try {
                let results: Record<string, DataPacket>;

                // Check if block requires backend processing
                if (requiresBackendProcessing(currentNode.type)) {
                    // Backend execution: POST /nodes/:id/run
                    console.log(`[useNodeExecution] Backend execution: ${currentNode.type}`);
                    const nodeResult = await runNode(nodeId);

                    // Extract outputData from API response
                    // Backend returns NodeView with outputData$$ (array format) or outputData (object format)
                    if (nodeResult.outputData$$) {
                        // Convert array format to object format
                        type OutputDataItem = {
                            portId: string;
                            packet: { value: unknown; type: string; timestamp?: number };
                        };
                        results = nodeResult.outputData$$.reduce<Record<string, DataPacket>>(
                            (acc: Record<string, DataPacket>, item: OutputDataItem) => {
                                acc[item.portId] = {
                                    value: item.packet.value,
                                    type: item.packet.type as 'text' | 'image' | 'number',
                                    timestamp: item.packet.timestamp || Date.now(),
                                };
                                return acc;
                            },
                            {}
                        );
                    } else {
                        results = {};
                    }
                } else if (nodeDef.execute) {
                    // Frontend execution: call block.execute() directly
                    console.log(`[useNodeExecution] Frontend execution: ${currentNode.type}`);
                    results = await nodeDef.execute(inputs, currentNode.config, onProgress);
                } else {
                    // No execute function available
                    console.warn(`[useNodeExecution] No execute function for: ${currentNode.type}`);
                    results = {};
                }

                const endTime = Date.now();
                const duration = endTime - startTime;

                const hash = nodeDef.inputs.map((p: PortDefinition) => inputs[p.id]?.timestamp).join('|');
                nodeInputHashesRef.current.set(nodeId, hash);

                setNodes(prev =>
                    prev.map(n =>
                        n.id === nodeId
                            ? {
                                  ...n,
                                  status: 'COMPLETED' as const,
                                  outputData: results,
                                  executionStats: {
                                      startTime,
                                      duration,
                                      progress: 100,
                                  },
                              }
                            : n
                    )
                );

                propagateOutputs(nodeId, results);
            } catch (e: unknown) {
                const endTime = Date.now();
                const duration = endTime - startTime;
                const errorMessage = e instanceof Error ? e.message : 'Unknown error';

                setNodes(prev =>
                    prev.map(n =>
                        n.id === nodeId
                            ? {
                                  ...n,
                                  status: 'ERROR' as const,
                                  errorMessage,
                                  executionStats: {
                                      startTime,
                                      duration,
                                      progress: 0,
                                  },
                              }
                            : n
                    )
                );

                onError?.(nodeId, errorMessage);
            }
        },
        [readOnly, blockRegistry, setNodes, propagateOutputs, onError]
    );

    const executeAllFromStart = useCallback(async () => {
        if (readOnly || isExecutingRef.current) return;

        isExecutingRef.current = true;
        abortControllerRef.current = new AbortController();

        // Find start nodes (nodes with no inputs or input nodes)
        const startNodes = nodesRef.current.filter(node => {
            const def = blockRegistry[node.type];
            if (!def) return false;
            return def.inputs.length === 0;
        });

        // Reset all nodes to IDLE first
        setNodes(prev =>
            prev.map(n => ({
                ...n,
                status: 'IDLE' as const,
                outputData: {},
                errorMessage: undefined,
            }))
        );

        // Execute start nodes
        for (const node of startNodes) {
            if (abortControllerRef.current?.signal.aborted) break;
            await executeNode(node.id);
        }

        isExecutingRef.current = false;
    }, [readOnly, blockRegistry, setNodes, executeNode]);

    const stopExecution = useCallback(() => {
        abortControllerRef.current?.abort();
        isExecutingRef.current = false;

        // Mark running nodes as idle
        setNodes(prev =>
            prev.map(n =>
                n.status === 'RUNNING' ? { ...n, status: 'IDLE' as const, errorMessage: 'Execution stopped' } : n
            )
        );
    }, [setNodes]);

    // Reactive execution trigger
    useEffect(() => {
        if (readOnly) return;

        nodes.forEach(node => {
            const def = blockRegistry[node.type];
            if (!def) return;
            if (def.inputs.length === 0) return;
            if (node.status === 'RUNNING') return;
            if (node.autoExecutionEnabled === false) return;

            const hasInputs = def.inputs.every(p => node.inputData[p.id]);

            if (hasInputs) {
                const currentInputHash = def.inputs.map(p => node.inputData[p.id]?.timestamp).join('|');
                const lastHash = nodeInputHashesRef.current.get(node.id);

                if (currentInputHash !== lastHash) {
                    nodeInputHashesRef.current.set(node.id, currentInputHash);
                    executeNode(node.id);
                }
            }
        });
    }, [nodes, executeNode, readOnly, blockRegistry]);

    return {
        executeNode,
        executeAllFromStart,
        stopExecution,
        isExecuting: isExecutingRef.current,
        propagateOutputs,
    };
};
