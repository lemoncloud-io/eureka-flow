/**
 * Image processing utility for config-based image transformation
 *
 * Processes images based on node config settings:
 * - aspectRatio: crops to specified ratio (e.g., "3:4", "16:9")
 * - maxWidth: resizes to max width while maintaining aspect ratio
 * - bypass: if "true", skips processing and only compresses
 */

import { THUMBNAIL_MAX_WIDTH } from '../consts';
import { compressImageIfNeeded } from './imageCompression';

export interface ImageProcessConfig {
    aspectRatio?: string; // "3:4", "1:1", "16:9", "free", etc.
    maxWidth?: string; // "1000" (string from server)
    bypass?: string; // "true" | "false" (string from server)
}

/** JPEG quality for processed output */
const OUTPUT_QUALITY = 0.9;

/**
 * Parse aspect ratio string to number
 *
 * @param ratio - Aspect ratio string like "3:4", "16:9", or "free"
 * @returns Numeric ratio (width/height) or undefined for free/invalid
 *
 * @example
 * parseAspectRatio("3:4")  // → 0.75
 * parseAspectRatio("16:9") // → 1.777...
 * parseAspectRatio("1:1")  // → 1
 * parseAspectRatio("free") // → undefined
 */
export const parseAspectRatio = (ratio: string | undefined): number | undefined => {
    if (!ratio || ratio === 'free') return undefined;

    const parts = ratio.split(':');
    if (parts.length !== 2) return undefined;

    const w = Number(parts[0]);
    const h = Number(parts[1]);

    if (isNaN(w) || isNaN(h) || h === 0) return undefined;

    return w / h;
};

/**
 * Find aspect ratio index in ASPECT_RATIOS array
 *
 * @param ratio - Aspect ratio string like "3:4"
 * @returns Index in standard ASPECT_RATIOS array (0 = Free, 1 = 1:1, etc.)
 */
export const getAspectRatioIndex = (ratio: string | undefined): number => {
    if (!ratio || ratio === 'free') return 0; // Free

    const ratioMap: Record<string, number> = {
        '1:1': 1,
        '4:3': 2,
        '3:4': 3,
        '16:9': 4,
    };

    return ratioMap[ratio] ?? 0;
};

/**
 * Crop and resize image using canvas
 *
 * @param dataUrl - Source image data URL
 * @param aspect - Target aspect ratio (width/height), undefined for no crop
 * @param maxWidth - Maximum output width in pixels
 * @returns Processed image data URL
 */
const cropAndResizeImage = (
    dataUrl: string,
    aspect: number | undefined,
    maxWidth: number | undefined
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => {
            let cropWidth = img.naturalWidth;
            let cropHeight = img.naturalHeight;
            let cropX = 0;
            let cropY = 0;

            // Apply aspect ratio crop (center crop)
            // If currentAspect === aspect, no cropping needed (exact match)
            if (aspect) {
                const currentAspect = img.naturalWidth / img.naturalHeight;

                if (currentAspect > aspect) {
                    // Image is wider than target - crop sides
                    cropWidth = Math.round(img.naturalHeight * aspect);
                    cropX = Math.round((img.naturalWidth - cropWidth) / 2);
                } else if (currentAspect < aspect) {
                    // Image is taller than target - crop top/bottom
                    cropHeight = Math.round(img.naturalWidth / aspect);
                    cropY = Math.round((img.naturalHeight - cropHeight) / 2);
                }
                // else: exact match, no crop needed
            }

            // Calculate output dimensions
            let outputWidth = cropWidth;
            let outputHeight = cropHeight;

            if (maxWidth && outputWidth > maxWidth) {
                const ratio = maxWidth / outputWidth;
                outputWidth = maxWidth;
                outputHeight = Math.round(outputHeight * ratio);
            }

            // Draw to canvas
            const canvas = document.createElement('canvas');
            canvas.width = outputWidth;
            canvas.height = outputHeight;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Failed to get canvas context'));
                return;
            }

            ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);

            const result = canvas.toDataURL('image/jpeg', OUTPUT_QUALITY);

            // Cleanup to free memory
            canvas.width = 0;
            canvas.height = 0;

            resolve(result);
        };

        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = dataUrl;
    });
};

/**
 * Process image with config settings
 *
 * Behavior:
 * - bypass="true" or no config: compress only (original dimensions)
 * - bypass="false": apply aspectRatio crop + maxWidth resize + compress
 * - aspectRatio="free" or undefined: skip crop, apply maxWidth only
 *
 * @param dataUrl - Source image data URL
 * @param config - Processing config from node
 * @returns Processed and compressed image data URL
 */
export const processImageWithConfig = async (dataUrl: string, config: ImageProcessConfig): Promise<string> => {
    // No config or bypass mode: compress only
    const bypass = config.bypass === 'true';
    const hasConfig = config.aspectRatio !== undefined || config.maxWidth !== undefined;

    if (bypass || !hasConfig) {
        const { dataUrl: compressed } = await compressImageIfNeeded(dataUrl);
        return compressed;
    }

    // Parse config values
    const aspect = parseAspectRatio(config.aspectRatio);
    const parsedWidth = config.maxWidth ? parseInt(config.maxWidth, 10) : undefined;
    const maxWidth = parsedWidth && !isNaN(parsedWidth) ? parsedWidth : undefined;

    // Skip processing if no valid settings
    if (!aspect && !maxWidth) {
        const { dataUrl: compressed } = await compressImageIfNeeded(dataUrl);
        return compressed;
    }

    // Apply crop and resize
    const processed = await cropAndResizeImage(dataUrl, aspect, maxWidth);

    // Compress final result
    const { dataUrl: compressed } = await compressImageIfNeeded(processed);

    return compressed;
};

/**
 * Process image as a flow thumbnail (no crop, 800px max width)
 * Preserves original aspect ratio for masonry layout variety.
 */
export const processThumbnail = (dataUrl: string): Promise<string> =>
    processImageWithConfig(dataUrl, {
        maxWidth: THUMBNAIL_MAX_WIDTH,
    });
