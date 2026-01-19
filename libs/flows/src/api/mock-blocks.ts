import type { BlockDefinition } from '@lemoncloud/eureka-flows-api';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Create a DataPacket helper
 */
const createPacket = (value: unknown, type: 'text' | 'image' | 'number') => ({
    value,
    type,
    timestamp: Date.now(),
});

/**
 * Mocked Block Definitions (fallback when API is unavailable)
 */
export const MOCKED_BLOCK_DEFINITIONS: BlockDefinition[] = [
    {
        type: 'input-text',
        label: 'User Text Input',
        description: 'Manually enter text to start flow',
        inputs: [],
        outputs: [{ id: 'out', label: 'Text', type: 'text' }],
        defaultConfig: { text: 'Hello World' },
        configSchema: [{ key: 'text', type: 'text', label: 'Value' }],
        execute: async (_inputs, config, onProgress) => {
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
        execute: async (_inputs, config, onProgress) => {
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
        execute: async (inputs, _config, onProgress) => {
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
        execute: async (_inputs, _config, onProgress) => {
            onProgress?.(100);
            return {};
        },
    },
    {
        type: 'image-resize',
        icon: '📐',
        label: 'Image 3:4 Filter',
        description: 'Resize and crop image to 3:4 aspect ratio',
        inputs: [{ id: 'in', label: 'Image', type: 'image' }],
        outputs: [{ id: 'out', label: 'Resized', type: 'image' }],
        defaultConfig: { rotation: 0, flipHorizontal: false, flipVertical: false },
        configSchema: [
            { key: 'rotation', type: 'number', label: 'Rotation (degrees)' },
            { key: 'flipHorizontal', type: 'boolean', label: 'Flip Horizontal' },
            { key: 'flipVertical', type: 'boolean', label: 'Flip Vertical' },
        ],
        execute: async (inputs, _config, onProgress) => {
            onProgress?.(100);
            return { out: createPacket(inputs['in'].value, 'image') };
        },
    },
];
