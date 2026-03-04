/**
 * Demo workflow definitions - hardcoded example workflows for demo mode
 */

import type { EdgeData, NodeData } from '@flows/flows';

export interface DemoWorkflow {
    id: string;
    name: string;
    description: string;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    nodes: NodeData[];
    edges: EdgeData[];
}

/**
 * Demo workflow with all executable blocks
 */
export const DEMO_WORKFLOWS: DemoWorkflow[] = [
    {
        id: 'all-blocks',
        name: 'All Blocks Demo',
        description: 'Demo workflow with all executable blocks',
        difficulty: 'beginner',
        nodes: [
            // Text flow: Input → Transform → Buffer → Preview
            {
                id: 'text-input',
                type: 'input-text',
                position: { x: 50, y: 316 },
                config: { text: 'Hello World!' },
                customLabel: 'Text Input',
            },
            {
                id: 'text-transform',
                type: 'text-transform',
                position: { x: 350, y: 216 },
                config: { mode: 'uppercase' },
                customLabel: 'Transform',
            },
            {
                id: 'buffer',
                type: 'buffer',
                position: { x: 650, y: 316 },
                config: { delayMs: '1000' },
                customLabel: 'Delay 1s',
            },
            {
                id: 'text-preview',
                type: 'output-preview',
                position: { x: 950, y: 336 },
                config: {},
                customLabel: 'Text Preview',
            },
            // Image flow: Input → Resize → Preview
            {
                id: 'image-input',
                type: 'input-image',
                position: { x: 50, y: 50 },
                config: { imageData: '' },
                customLabel: 'Image Input',
            },
            {
                id: 'image-resize',
                type: 'image-resize',
                position: { x: 350, y: 50 },
                config: { rotation: '0', flipHorizontal: 'false', flipVertical: 'false' },
                customLabel: 'Resize',
            },
            {
                id: 'image-preview',
                type: 'output-preview',
                position: { x: 650, y: 50 },
                config: {},
                customLabel: 'Image Preview',
            },
            // Debug: Console log
            {
                id: 'debug-log',
                type: 'output-console',
                position: { x: 950, y: 50 },
                config: { prefix: 'Debug:' },
                customLabel: 'Console Log',
            },
        ],
        edges: [
            // Text flow connections
            {
                id: 'e1',
                sourceNodeId: 'text-input',
                sourcePortId: 'out',
                targetNodeId: 'text-transform',
                targetPortId: 'in',
            },
            {
                id: 'e2',
                sourceNodeId: 'text-transform',
                sourcePortId: 'out',
                targetNodeId: 'buffer',
                targetPortId: 'in',
            },
            {
                id: 'e3',
                sourceNodeId: 'buffer',
                sourcePortId: 'out',
                targetNodeId: 'text-preview',
                targetPortId: 'in',
            },
            // Image flow connections
            {
                id: 'e4',
                sourceNodeId: 'image-input',
                sourcePortId: 'out',
                targetNodeId: 'image-resize',
                targetPortId: 'in',
            },
            {
                id: 'e5',
                sourceNodeId: 'image-resize',
                sourcePortId: 'out',
                targetNodeId: 'image-preview',
                targetPortId: 'in',
            },
            // Debug connection (from buffer output)
            {
                id: 'e6',
                sourceNodeId: 'buffer',
                sourcePortId: 'out',
                targetNodeId: 'debug-log',
                targetPortId: 'in',
            },
        ],
    },
];

/**
 * Get a demo workflow by ID
 */
export const getDemoWorkflow = (id: string): DemoWorkflow | undefined => {
    return DEMO_WORKFLOWS.find(w => w.id === id);
};
