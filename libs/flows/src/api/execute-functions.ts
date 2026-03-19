import { decodeDataUrl } from '../utils/dataUrl';

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

type ExecuteFunction = NonNullable<BlockDefinition['execute']>;

// Shared execute functions (used by multiple block types for backward compat)
const executeOutputConsole: ExecuteFunction = async (inputs, config, onProgress) => {
    const logMessage = config.message || inputs['in']?.value;
    console.log('[output-console]', logMessage);
    onProgress?.(100);
    return { out: inputs['in'] || createPacket(logMessage, 'text') };
};

const executeOutputPreview: ExecuteFunction = async (inputs, _config, onProgress) => {
    onProgress?.(100);
    return { out: inputs['in'] || createPacket('', 'text') };
};

/**
 * Client-side execute functions for blocks that don't use backend processing
 * Key: block type from server (e.g., "input-text")
 * Value: execute function
 *
 * Config keys must match server's configSchema keys
 */
export const EXECUTE_FUNCTIONS: Record<string, ExecuteFunction> = {
    // Server type: input-text, config key: text
    'input-text': async (_inputs, config, onProgress) => {
        onProgress?.(100);
        return { out: createPacket(config.text, 'text') };
    },

    // Server type: input-image, config keys: imageData (image) or fileData (text file)
    'input-image': async (_inputs, config, onProgress) => {
        if (config.fileData) {
            onProgress?.(100);
            const decoded = decodeDataUrl(String(config.fileData));
            return { out: createPacket(decoded, 'text') };
        }
        if (!config.imageData) throw new Error('No image data provided');
        onProgress?.(100);
        return { out: createPacket(config.imageData, 'image') };
    },

    // Server type: buffer-delay, config key: delayMs
    'buffer-delay': async (inputs, config, onProgress) => {
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

    // Alias: buffer (same as buffer-delay)
    buffer: async (inputs, config, onProgress) => {
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

    // Server type: text-transform, config key: mode
    'text-transform': async (inputs, config, onProgress) => {
        const text = String(inputs['in'].value);
        onProgress?.(20);
        const result = `#mock: ${config.mode}(${text})`;
        await delay(300);
        onProgress?.(100);
        return { out: createPacket(result, 'text') };
    },

    // Server type: length-validator, config keys: min, max, value
    'length-validator': async (inputs, config, onProgress) => {
        const text = String(inputs['in']?.value || config.value || '');
        const min = Number(config.min) || 0;
        const max = config.max ? Number(config.max) : Infinity;
        onProgress?.(50);
        if (text.length < min) {
            throw new Error(`Text length (${text.length}) is less than min (${min}). Flow stopped.`);
        }
        if (text.length > max) {
            throw new Error(`Text length (${text.length}) exceeds max (${max}). Flow stopped.`);
        }
        onProgress?.(100);
        return { out: createPacket(text, 'text') };
    },

    // Server type: image-info, no config keys
    'image-info': async (inputs, _config, onProgress) => {
        onProgress?.(10);
        const src = inputs['in'].value;

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                onProgress?.(100);
                const info = `Width: ${img.width}px, Height: ${img.height}px`;
                resolve({ out: createPacket(info, 'text') });
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = src as string;
        });
    },

    // output-console: logs input to console (new name + legacy aliases)
    'output-console': executeOutputConsole,
    'console-log': executeOutputConsole,
    'debug-log': executeOutputConsole,

    // output-preview: passes through input to output (new name + legacy aliases)
    'output-preview': executeOutputPreview,
    'result-preview': executeOutputPreview,
    preview: executeOutputPreview,

    // Server type: image-resize, config keys: rotation, flipHorizontal, flipVertical
    // Demo mode: pass-through (actual resize would require canvas manipulation)
    'image-resize': async (inputs, _config, onProgress) => {
        onProgress?.(100);
        return { out: inputs['in'] || createPacket('', 'image') };
    },

    // Server type: image-3-4-filter, config key: tolerance
    'image-3-4-filter': async (inputs, _config, onProgress) => {
        onProgress?.(100);
        return { out: createPacket(inputs['in'].value, 'image') };
    },

    // Server type: echo, no config keys
    echo: async (inputs, _config, onProgress) => {
        onProgress?.(100);
        return { out: inputs['in'] || createPacket('', 'text') };
    },
};
