import axios from 'axios';

import { API_URL } from '@flows/web-core';

import { createPacket, loadFlow } from './flows';

import type {
    BlockDefinition,
    BlockView,
    DataPacket,
    ListResult,
    ProcessBody,
    ProcessResult,
    WorkflowState,
} from '@lemoncloud/eureka-flows-api';

const _log = console.log.bind(console, '[blocks-api]');
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Create axios instance for API calls
const apiClient = axios.create({
    baseURL: API_URL,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    },
});

/**
 * Execute headless workflow for component blocks
 */
export const executeHeadlessWorkflow = async (
    flow: WorkflowState,
    inputData: DataPacket
): Promise<DataPacket | null> => {
    // Find input nodes (nodes without inputs)
    const inputNodes = flow.nodes.filter(n => {
        const def = MOCKED_BLOCK_DEFINITIONS.find(d => d.type === n.type);
        return def && def.inputs.length === 0;
    });

    // Inject input data into first input node
    if (inputNodes.length > 0 && inputData) {
        inputNodes[0].outputData = { out: inputData };
    }

    // Simple execution simulation - return last node's output
    const outputNodes = flow.nodes.filter(n => {
        const def = MOCKED_BLOCK_DEFINITIONS.find(d => d.type === n.type);
        return def && def.outputs.length === 0;
    });

    if (outputNodes.length > 0) {
        return outputNodes[0].inputData?.in || null;
    }

    return null;
};

// Mocked Block Definitions
const MOCKED_BLOCK_DEFINITIONS: BlockDefinition[] = [
    {
        type: 'input-text',
        label: 'User Text Input',
        description: 'Manually enter text to start flow',
        inputs: [],
        outputs: [{ id: 'out', label: 'Text', type: 'text' }],
        defaultConfig: { text: 'Hello World' },
        configSchema: [{ key: 'text', type: 'text', label: 'Value' }],
        execute: async (inputs, config, onProgress) => {
            onProgress?.(100);
            return { out: createPacket(config.text, 'text') };
        },
    },
    {
        type: 'input-image',
        label: 'User Image Input',
        description: 'Upload an image to start flow',
        inputs: [],
        outputs: [{ id: 'out', label: 'Image', type: 'image' }],
        defaultConfig: { imageData: '' },
        configSchema: [{ key: 'imageData', type: 'file', label: 'Image' }],
        execute: async (inputs, config, onProgress) => {
            if (!config.imageData) throw new Error('No image data provided');
            onProgress?.(100);
            return { out: createPacket(config.imageData, 'image') };
        },
    },
    {
        type: 'buffer',
        label: 'Buffer (Delay)',
        description: 'Waits for specified time before passing data',
        inputs: [{ id: 'in', label: 'Input', type: 'any' }],
        outputs: [{ id: 'out', label: 'Output', type: 'any' }],
        defaultConfig: { delayMs: 1000 },
        configSchema: [{ key: 'delayMs', type: 'number', label: 'Delay (ms)' }],
        execute: async (inputs, config, onProgress) => {
            const input = inputs['in'];
            const totalMs = Number(config.delayMs) || 1000;
            const steps = 10;
            const stepMs = totalMs / steps;

            for (let i = 1; i <= steps; i++) {
                await delay(stepMs);
                onProgress?.(Math.round((i / steps) * 100));
            }

            return { out: { ...input, timestamp: Date.now() } };
        },
    },
    {
        type: 'text-transform',
        label: 'Text Transform',
        description: 'Modify text (Upper, Lower, Reverse)',
        inputs: [{ id: 'in', label: 'Text', type: 'text' }],
        outputs: [{ id: 'out', label: 'Result', type: 'text' }],
        defaultConfig: { mode: 'uppercase' },
        configSchema: [
            {
                key: 'mode',
                type: 'select',
                label: 'Mode',
                options: [
                    { label: 'Uppercase', value: 'uppercase' },
                    { label: 'Lowercase', value: 'lowercase' },
                    { label: 'Reverse', value: 'reverse' },
                    { label: 'Length', value: 'length' },
                ],
            },
        ],
        execute: async (inputs, config, onProgress) => {
            const text = String(inputs['in'].value);
            onProgress?.(20);
            const result = `#mock: ${config.mode}(${text})`;
            await delay(300);
            onProgress?.(100);
            return { out: createPacket(result, 'text') };
        },
    },
    {
        type: 'validation-length',
        label: 'Length Validator',
        description: 'Errors if text length is too short',
        inputs: [{ id: 'in', label: 'Text', type: 'text' }],
        outputs: [{ id: 'out', label: 'Verified', type: 'text' }],
        defaultConfig: { minLength: 5 },
        configSchema: [{ key: 'minLength', type: 'number', label: 'Error if Length <=' }],
        execute: async (inputs, config, onProgress) => {
            const text = String(inputs['in'].value);
            const min = Number(config.minLength) || 0;
            onProgress?.(50);
            if (text.length <= min) {
                throw new Error(`Text length (${text.length}) is <= ${min}. Flow stopped.`);
            }
            onProgress?.(100);
            return { out: createPacket(text, 'text') };
        },
    },
    {
        type: 'image-info',
        label: 'Image Info',
        description: 'Extracts dimensions from an image',
        inputs: [
            { id: 'in', label: 'Image', type: 'image' },
            { id: 'text_in', label: 'Text', type: 'text' },
        ],
        outputs: [{ id: 'out', label: 'Description', type: 'text' }],
        defaultConfig: {},
        execute: async (inputs, config, onProgress) => {
            onProgress?.(10);
            const src = inputs['in'].value;
            const extraText = inputs['text_in']?.value;

            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    onProgress?.(100);
                    let info = `Width: ${img.width}px, Height: ${img.height}px`;
                    if (extraText) info += ` | ${extraText}`;
                    resolve({ out: createPacket(info, 'text') });
                };
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = src as string;
            });
        },
    },
    {
        type: 'debug-log',
        label: 'Console Log',
        description: 'Displays input in the debug console',
        inputs: [{ id: 'in', label: 'Any', type: 'any' }],
        outputs: [],
        defaultConfig: { prefix: 'Log:' },
        configSchema: [{ key: 'prefix', type: 'text', label: 'Prefix' }],
        execute: async (inputs, config, onProgress) => {
            console.log(config.prefix, inputs['in'].value);
            onProgress?.(100);
            return {};
        },
    },
    {
        type: 'preview',
        label: 'Result Preview',
        description: 'Visualizes the final output',
        inputs: [{ id: 'in', label: 'Data', type: 'any' }],
        outputs: [],
        defaultConfig: {},
        execute: async (inputs, config, onProgress) => {
            onProgress?.(100);
            return {};
        },
    },
    {
        type: 'workflow-component',
        label: 'Component',
        description: 'Runs a saved workflow as a block',
        inputs: [{ id: 'in', label: 'Input', type: 'any' }],
        outputs: [{ id: 'out', label: 'Result', type: 'any' }],
        defaultConfig: { selectedFlowId: '' },
        configSchema: [{ key: 'selectedFlowId', type: 'workflow-selector', label: 'Select Workflow' }],
        execute: async (inputs, config, onProgress) => {
            if (!config.selectedFlowId) throw new Error('No flow selected');
            onProgress?.(10);
            const subFlowState = await loadFlow(config.selectedFlowId);
            onProgress?.(30);
            if (!subFlowState) throw new Error('Failed to load sub-flow');
            const result = await executeHeadlessWorkflow(subFlowState, inputs['in']);
            onProgress?.(100);
            if (!result) throw new Error('Sub-flow produced no output');
            return { out: result };
        },
    },
    {
        type: 'image-resize',
        icon: '📐',
        label: '이미지 3:4 필터',
        description: '기본 3:4 사이즈로 이미지 리사이즈 및 크롭 처리함',
        inputs: [{ id: 'in', label: 'Image', type: 'image' }],
        outputs: [{ id: 'out', label: 'Resized', type: 'image' }],
        defaultConfig: { rotation: 0, flipHorizontal: false, flipVertical: false },
        configSchema: [
            { key: 'rotation', type: 'number', label: 'Rotation (degrees)' },
            { key: 'flipHorizontal', type: 'boolean', label: 'Flip Horizontal' },
            { key: 'flipVertical', type: 'boolean', label: 'Flip Vertical' },
        ],
        execute: async (inputs, config, onProgress) => {
            // Simplified - just pass through in this lib version
            onProgress?.(100);
            return { out: createPacket(inputs['in'].value, 'image') };
        },
    },
];

/**
 * Factory to create execute function for BlockDefinition from API
 */
const createExecuteFunction = (block: BlockDefinition): BlockDefinition['execute'] => {
    return async (inputs, config, onProgress) => {
        const id = block.id || block.type;
        const ep = `/blocks/${id}/process`;
        _log(`> Executing block[${id}]`);

        onProgress?.(10);
        const body: ProcessBody = { inputs, config };
        const result = await apiClient.post<ProcessResult>(ep, body);
        _log(`> Received output from block[${id}]`);
        onProgress?.(100);

        return Object.entries(result.data.$output).reduce<Record<string, DataPacket>>((acc, [key, val]) => {
            acc[key] = createPacket(val?.value, val?.type || ('text' as 'text' | 'image' | 'number'));
            return acc;
        }, {});
    };
};

/**
 * Fetch all available block definitions
 */
export const listBlocks = async (): Promise<BlockDefinition[]> => {
    await delay(500);

    try {
        const response = await apiClient.get<ListResult<BlockView>>('/blocks/0/list?cores=1');
        const list = response.data?.list
            ?.map(item => item?.$definition)
            .filter((def): def is BlockDefinition => !!def?.label)
            .map(def => ({ ...def, execute: createExecuteFunction(def) }));

        _log('> API listBlocks?.len =', list?.length);

        if (!list?.length) return MOCKED_BLOCK_DEFINITIONS;

        // Merge with mocked definitions
        return list.reduce<BlockDefinition[]>(
            (acc, block) => {
                const idx = acc.findIndex(m => m.type === block.type);
                if (idx >= 0) {
                    acc[idx] = block;
                } else {
                    acc.push(block);
                }
                return acc;
            },
            [...MOCKED_BLOCK_DEFINITIONS]
        );
    } catch (err) {
        console.error('> API listBlocks error =', err);
        return MOCKED_BLOCK_DEFINITIONS;
    }
};

export { MOCKED_BLOCK_DEFINITIONS };
