/**
 * useDemoMode - hook for demo mode state management
 *
 * Provides:
 * - Block registry initialization from hardcoded data
 * - Example workflow selection and loading
 * - JSON export/import functionality
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { EXECUTE_FUNCTIONS, useFlowsStore } from '@flows/flows';

import { DEMO_BLOCKS } from '../data/demo-blocks';
import { DEMO_WORKFLOWS, getDemoWorkflow } from '../data/demo-workflows';

import type { DemoWorkflow } from '../data/demo-workflows';
import type { BlockDefinitionWithFrontend, EdgeData, NodeData } from '@flows/flows';

export interface UseDemoModeReturn {
    /** Whether demo mode is initialized */
    isInitialized: boolean;
    /** List of available demo workflows */
    workflows: DemoWorkflow[];
    /** Currently selected workflow ID */
    selectedWorkflowId: string | null;
    /** Current workflow data (nodes and edges) */
    currentWorkflow: { nodes: NodeData[]; edges: EdgeData[] } | null;
    /** Select and load a demo workflow */
    selectWorkflow: (workflowId: string) => void;
    /** Export current workflow as JSON */
    exportWorkflow: (nodes: NodeData[], edges: EdgeData[]) => void;
    /** Import workflow from JSON file */
    importWorkflow: (file: File) => Promise<{ nodes: NodeData[]; edges: EdgeData[] } | null>;
    /** Clear current workflow */
    clearWorkflow: () => void;
}

/**
 * Hook for managing demo mode state
 */
export const useDemoMode = (): UseDemoModeReturn => {
    const { setBlockRegistry, setBlocksLoaded, setFlowName } = useFlowsStore();
    const [isInitialized, setIsInitialized] = useState(false);
    const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
    const [currentWorkflow, setCurrentWorkflow] = useState<{ nodes: NodeData[]; edges: EdgeData[] } | null>(null);

    // Attach execute functions from EXECUTE_FUNCTIONS to block definitions
    const blocksWithExecute = useMemo<BlockDefinitionWithFrontend[]>(() => {
        return DEMO_BLOCKS.map(block => {
            const executeFunc = EXECUTE_FUNCTIONS[block.type];
            if (executeFunc) {
                return { ...block, execute: executeFunc };
            }
            return block;
        });
    }, []);

    // Initialize block registry on mount
    useEffect(() => {
        setBlockRegistry(blocksWithExecute);
        setBlocksLoaded(true);
        setFlowName('Demo Workflow');
        setIsInitialized(true);
    }, [setBlockRegistry, setBlocksLoaded, setFlowName, blocksWithExecute]);

    // Select and load a demo workflow
    const selectWorkflow = useCallback(
        (workflowId: string) => {
            const workflow = getDemoWorkflow(workflowId);
            if (workflow) {
                setSelectedWorkflowId(workflowId);
                setCurrentWorkflow({
                    nodes: workflow.nodes,
                    edges: workflow.edges,
                });
                setFlowName(workflow.name);
            }
        },
        [setFlowName]
    );

    // Export current workflow as JSON
    const exportWorkflow = useCallback((nodes: NodeData[], edges: EdgeData[]) => {
        const data = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            nodes,
            edges,
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `workflow-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, []);

    // Import workflow from JSON file
    const importWorkflow = useCallback(
        async (file: File): Promise<{ nodes: NodeData[]; edges: EdgeData[] } | null> => {
            return new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = event => {
                    try {
                        const content = event.target?.result as string;
                        const data = JSON.parse(content);

                        // Validate structure
                        if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
                            console.error('Invalid workflow format: missing nodes or edges array');
                            resolve(null);
                            return;
                        }

                        const result = {
                            nodes: data.nodes as NodeData[],
                            edges: data.edges as EdgeData[],
                        };

                        setSelectedWorkflowId(null);
                        setCurrentWorkflow(result);
                        setFlowName(file.name.replace('.json', ''));
                        resolve(result);
                    } catch (error) {
                        console.error('Failed to parse workflow JSON:', error);
                        resolve(null);
                    }
                };
                reader.onerror = () => {
                    console.error('Failed to read file');
                    resolve(null);
                };
                reader.readAsText(file);
            });
        },
        [setFlowName]
    );

    // Clear current workflow
    const clearWorkflow = useCallback(() => {
        setSelectedWorkflowId(null);
        setCurrentWorkflow(null);
        setFlowName('New Workflow');
    }, [setFlowName]);

    return {
        isInitialized,
        workflows: DEMO_WORKFLOWS,
        selectedWorkflowId,
        currentWorkflow,
        selectWorkflow,
        exportWorkflow,
        importWorkflow,
        clearWorkflow,
    };
};
