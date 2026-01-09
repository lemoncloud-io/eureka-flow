import { BLOCK_REGISTRY } from '../constants'; // Circular ref warning handled by runtime usually or design

import type { DataPacket, NodeData, WorkflowState } from '../types';

/* Utility Functions for Workflow Editor */
export const generateId = (): string => Math.random().toString(36).substr(2, 9);

export const getBezierPath = (x1: number, y1: number, x2: number, y2: number): string => {
    const dist = Math.abs(x2 - x1);
    const cp1x = x1 + dist * 0.5;
    const cp1y = y1;
    const cp2x = x2 - dist * 0.5;
    const cp2y = y2;
    return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
};

export const isValidConnection = (
    sourceNode: NodeData,
    sourceIdx: number,
    targetNode: NodeData,
    targetIdx: number,
    sourceType: string,
    targetType: string
): boolean => {
    if (sourceNode.id === targetNode.id) return false;
    if (targetType === 'any') return true;
    if (sourceType === 'any') return true;
    return sourceType === targetType;
};

// --- HEADLESS ENGINE FOR COMPONENTS ---

export const executeHeadlessWorkflow = async (
    state: WorkflowState,
    inputData: DataPacket
): Promise<DataPacket | null> => {
    // 1. Deep copy to avoid mutating source
    const nodes = JSON.parse(JSON.stringify(state.nodes)) as NodeData[];
    const connections = state.connections;

    // 2. Identify Entry Nodes (Input nodes)
    // For this MVP component logic: We inject the component input into ALL 'input-text' or 'input-image' nodes within the component.
    const entryNodes = nodes.filter(n => n.type === 'input-text' || n.type === 'input-image' || n.type === 'buffer');

    // Inject Data
    entryNodes.forEach(node => {
        // We override the config or output of input nodes to simulate user entry
        if (inputData.type === 'text' && node.type === 'input-text') {
            node.config.text = inputData.value;
        } else if (inputData.type === 'image' && node.type === 'input-image') {
            node.config.imageData = inputData.value;
        } else {
            // For buffer or others, we treat the 'in' port as receiving data
            node.inputData['in'] = inputData;
        }
        node.status = 'RUNNING'; // Mark as ready to process
    });

    // 3. Execution Loop (Simple Topological/Iterative)
    // We loop until no more nodes can be executed.
    let active = true;
    let iterations = 0;
    let lastOutputPacket: DataPacket | null = null;

    while (active && iterations < 50) {
        // Safety break
        active = false;
        iterations++;

        // Find nodes ready to run
        // Criteria: IDLE/RUNNING, and inputs satisfied (or is input node)
        for (const node of nodes) {
            if (node.status === 'COMPLETED' || node.status === 'ERROR') continue;

            const def = (BLOCK_REGISTRY as any)[node.type]; // Access registry dynamically
            if (!def) continue;

            // Check inputs
            const inputPorts = def.inputs;
            const hasAllInputs = inputPorts.every((p: any) => node.inputData[p.id]);

            // Input nodes (no inputs required) or Regular nodes with inputs
            if (inputPorts.length === 0 || hasAllInputs) {
                try {
                    // Execute
                    // Note: We don't track progress in headless mode currently
                    const result = await def.execute(node.inputData, node.config);
                    node.outputData = result;
                    node.status = 'COMPLETED';
                    active = true;

                    // Propagate
                    const relevantConns = connections.filter(c => c.sourceNodeId === node.id);
                    relevantConns.forEach(conn => {
                        const targetNode = nodes.find(n => n.id === conn.targetNodeId);
                        if (targetNode) {
                            if (result[conn.sourcePortId]) {
                                targetNode.inputData[conn.targetPortId] = result[conn.sourcePortId];
                                // If target was IDLE, it might become ready in next loop
                            }
                        }
                    });

                    // Capture "Final" output
                    // We assume the last executed node that produces output is the result
                    const outKeys = Object.keys(result);
                    if (outKeys.length > 0) {
                        lastOutputPacket = result[outKeys[0]];
                    }
                } catch (e) {
                    node.status = 'ERROR';
                    console.error('Headless Error', e);
                }
            }
        }
    }

    return lastOutputPacket;
};
