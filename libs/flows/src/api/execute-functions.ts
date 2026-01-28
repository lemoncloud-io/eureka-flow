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

    // Server type: input-image, config key: imageData
    'input-image': async (_inputs, config, onProgress) => {
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

    // Server type: console-log, config key: message
    'console-log': async (inputs, config, onProgress) => {
        const logMessage = config.message || inputs['in']?.value;
        console.log('[console-log]', logMessage);
        onProgress?.(100);
        return { out: inputs['in'] || createPacket(logMessage, 'text') };
    },

    // Server type: result-preview, no config keys
    'result-preview': async (inputs, _config, onProgress) => {
        onProgress?.(100);
        // Pass through input to output
        return { out: inputs['in'] || createPacket('', 'text') };
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
