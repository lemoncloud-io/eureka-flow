import apiClient from './axios';
import { executeHeadlessWorkflow } from '../utils/';
import { processImage } from '../utils/imageProcessing';

import type {
    BlockDefinition,
    BlockView,
    DataPacket,
    ListResult,
    LogEntry,
    ProcessBody,
    ProcessResult,
    WorkflowState,
} from '../types';

const STORAGE_PREFIX = 'flow_mosaic_';
const INDEX_KEY = 'flow_mosaic_index';
const _log = console.log.bind(console, '[api]');

// Type for Flow Metadata
export interface FlowMeta {
    id: string;
    name: string;
    updatedAt: number;
}

// Helpers for Block Logic
const createPacket = (value: any, type: 'text' | 'image' | 'number'): DataPacket => ({
    value,
    type,
    timestamp: Date.now(),
});

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- API IMPLEMENTATION (Hoisted Functions) ---

async function listFlows(): Promise<FlowMeta[]> {
    try {
        const indexStr = localStorage.getItem(INDEX_KEY);
        return indexStr ? JSON.parse(indexStr) : [];
    } catch (e) {
        return [];
    }
}

// Default Demo Workflow
const DEFAULT_FLOW: WorkflowState = {
    nodes: [
        {
            id: 'node-1',
            type: 'input-text',
            position: { x: 100, y: 150 },
            config: { text: 'Hello Component!' },
            status: 'IDLE',
            inputData: {},
            outputData: {},
        },
        {
            id: 'node-2',
            type: 'text-transform',
            position: { x: 450, y: 150 },
            config: { mode: 'uppercase' },
            status: 'IDLE',
            inputData: {},
            outputData: {},
        },
    ],
    connections: [
        {
            id: 'conn-1',
            sourceNodeId: 'node-1',
            sourcePortId: 'out',
            targetNodeId: 'node-2',
            targetPortId: 'in',
        },
    ],
};

async function loadFlow(id?: string): Promise<WorkflowState> {
    await delay(300);

    // If no ID provided, try to load the last opened or default
    if (!id) {
        const list = await listFlows();
        if (list.length > 0) {
            id = list[0].id;
        } else {
            return JSON.parse(JSON.stringify(DEFAULT_FLOW));
        }
    }

    try {
        const stored = localStorage.getItem(STORAGE_PREFIX + id);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.error('Failed to load', e);
    }

    return JSON.parse(JSON.stringify(DEFAULT_FLOW));
}

async function loadDesign(id?: string): Promise<WorkflowState> {
    return loadFlow(id);
}

async function saveFlow(state: WorkflowState, name: string): Promise<{ success: boolean; id: string }> {
    await delay(300);
    try {
        const list = await listFlows();
        // Simple logic: if name exists, update it. If not, create new.
        const existing = list.find(f => f.name === name);
        const id = existing ? existing.id : Math.random().toString(36).substr(2, 9);

        // Save Data
        localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(state));

        // Update Index
        if (!existing) {
            const newMeta: FlowMeta = { id, name, updatedAt: Date.now() };
            localStorage.setItem(INDEX_KEY, JSON.stringify([...list, newMeta]));
        } else {
            const updatedList = list.map(f => (f.id === id ? { ...f, updatedAt: Date.now() } : f));
            localStorage.setItem(INDEX_KEY, JSON.stringify(updatedList));
        }

        return { success: true, id };
    } catch (e) {
        console.error('Failed to save', e);
        return { success: false, id: '' };
    }
}

async function resetFlow(): Promise<boolean> {
    return true;
}

async function fetchBlockLogs(nodeId: string): Promise<LogEntry[]> {
    await delay(500); // Simulate network latency

    const now = Date.now();
    const randomLogs: LogEntry[] = [];
    const count = Math.floor(Math.random() * 10) + 5; // 5 to 15 logs

    for (let i = 0; i < count; i++) {
        const timeOffset = (count - i) * 1000 * 60; // Minutes ago
        const isError = Math.random() > 0.8;
        const isWarn = Math.random() > 0.7;

        randomLogs.push({
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date(now - timeOffset).toISOString(),
            type: i === 0 ? 'INIT' : 'EXECUTION',
            level: isError ? 'ERROR' : isWarn ? 'WARN' : 'INFO',
            message: isError
                ? `Failed to process input data at index ${i}`
                : isWarn
                  ? `High latency detected during step ${i}`
                  : `Successfully processed chunk ${i}`,
        });
    }

    // Ensure latest is first
    return randomLogs.reverse();
}

// --- MOCKED SERVER DATA (BLOCK DEFINITIONS) ---
// Defined AFTER helper functions so it can use them (e.g. loadFlow)
const MOCKED_BLOCK_DEFINITIONS: BlockDefinition[] = [
    // 1. User Text Input
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

    // 2. User Image Input
    {
        type: 'input-image',
        label: 'User Image Input',
        description: 'Upload an image to start flow',
        inputs: [],
        outputs: [{ id: 'out', label: 'Image', type: 'image' }],
        defaultConfig: { imageData: '' }, // Base64 string
        configSchema: [{ key: 'imageData', type: 'file', label: 'Image' }],
        execute: async (inputs, config, onProgress) => {
            if (!config.imageData) throw new Error('No image data provided');
            onProgress?.(100);
            return { out: createPacket(config.imageData, 'image') };
        },
    },

    // 3. Buffer / Delay
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

    // 4. Text Transformer
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
            let result = text;

            onProgress?.(20);
            result = `#mock: ${config.mode}(${text})`; // Mocked result for demo
            await delay(300);
            onProgress?.(100);

            return { out: createPacket(result, 'text') };
        },
    },

    // 5. Validation Block
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

    // 6. Image Info
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
                    if (extraText) {
                        info += ` | ${extraText}`;
                    }
                    resolve({ out: createPacket(info, 'text') });
                };
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = src;
            });
        },
    },

    // 7. Debug Log
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

    // 8. Preview
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

    // 9. Workflow Component
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
            // Call the hoisted loadFlow function directly to avoid circular dependency on 'api' const
            const subFlowState = await loadFlow(config.selectedFlowId);
            onProgress?.(30);

            if (!subFlowState) throw new Error('Failed to load sub-flow');

            const result = await executeHeadlessWorkflow(subFlowState, inputs['in']);
            onProgress?.(100);

            if (!result) throw new Error('Sub-flow produced no output');
            return { out: result };
        },
    },

    // 10. Image Resizer
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
            const src = inputs['in'].value;
            const rotation = Number(config.rotation) || 0;
            const flipHorizontal = config.flipHorizontal !== false; // Default true
            const flipVertical = config.flipVertical !== false; // Default true
            // console.log('> src =', src);
            console.log('> rotation =', rotation, ', flipH =', flipHorizontal, ', flipV =', flipVertical);

            onProgress?.(10);
            const res = await processImage(src, { rotation, flipHorizontal, flipVertical });
            console.log('> width :=', res?.width, ', height :=', res?.height);
            onProgress?.(100);
            return { out: createPacket(res.base64, 'image') };
        },
    },
];

// async function listBlocks(): Promise<BlockDefinition[]> {
//       await delay(800); // Simulate boot-up / network time
//       return MOCKED_BLOCK_DEFINITIONS;
// }

/**
 * factory to create execute function for BlockDefinition
 */
const $execute = (N: BlockDefinition): BlockDefinition['execute'] => {
    return async (inputs, config, onProgress) => {
        const id = N.id || N.type;
        const ep = `/blocks/${id}/process`;
        _log(`> Executing block[${id}] via inputs =`, inputs, ', config =', config);

        onProgress?.(10);
        const body: ProcessBody = { inputs, config };
        const result = await apiClient.post<ProcessResult>(ep, body);
        _log(`> Received output from block[${id}] :=`, result.data.$output);
        onProgress?.(100);

        return Object.entries(result.data.$output).reduce<Record<string, DataPacket>>((acc, [key, N]) => {
            acc[key] = createPacket(N?.value, N?.type || ('text' as any));
            return acc;
        }, {});
    };
};

async function listBlocks(): Promise<BlockDefinition[]> {
    await delay(500); // Simulate boot-up / network time

    //* fetch list from API
    const $res = await apiClient.get<ListResult<BlockView>>('/blocks/0/list?cores=1').catch(err => {
        console.error('> API listBlocks error =', err);
        return null as { data: ListResult<BlockView> } | null;
    });

    //* convet API BlockView to BlockDefinition with execute function
    const list = $res?.data?.list
        ?.map(N => N?.$definition)
        .filter(N => !!N?.label)
        .map(N => {
            return { ...N, execute: $execute(N) };
        });
    console.log('> API listBlocks?.len =', list?.length);
    if (!list?.length) return MOCKED_BLOCK_DEFINITIONS;

    //* merge with MOCKED_BLOCK_DEFINITIONS to avoid missing blocks
    return list.reduce<BlockDefinition[]>(
        (L, N) => {
            const idx = L.findIndex(M => M.type === N.type);
            if (idx >= 0) {
                L[idx] = N;
            } else {
                L.push(N);
            }
            return L;
        },
        [...MOCKED_BLOCK_DEFINITIONS]
    );
}

// Export the API object
export const api = {
    listBlocks,
    listFlows,
    loadFlow,
    loadDesign,
    saveFlow,
    resetFlow,
    fetchBlockLogs,
};
