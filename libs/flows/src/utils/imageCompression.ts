/**
 * Image compression utility
 *
 * Compresses images only when they exceed the size threshold (5MB)
 * to avoid Lambda/API Gateway 6MB limit while preserving quality.
 */

/** 5MB in bytes - compress only if larger */
const COMPRESSION_THRESHOLD = 5 * 1024 * 1024;

/** Target size after compression (~5.5MB to leave margin for Lambda 6MB limit) */
const TARGET_SIZE = 5.5 * 1024 * 1024;

/** Starting quality for compression (high to preserve quality) */
const INITIAL_QUALITY = 0.92;

/** Minimum quality to try before giving up */
const MIN_QUALITY = 0.5;

/** Quality decrement step */
const QUALITY_STEP = 0.05;

/**
 * Get the byte size of a base64 data URL
 */
const getBase64Size = (dataUrl: string): number => {
    // Remove data URL prefix to get pure base64
    const base64 = dataUrl.split(',')[1];
    if (!base64) return 0;

    // Base64 encodes 3 bytes into 4 characters
    // Account for padding
    const padding = (base64.match(/=/g) || []).length;
    return Math.floor((base64.length * 3) / 4) - padding;
};

/**
 * Get MIME type from data URL
 */
const getMimeType = (dataUrl: string): string => {
    const match = dataUrl.match(/data:([^;]+);/);
    return match ? match[1] : 'image/jpeg';
};

/**
 * Check if MIME type supports quality compression
 */
const supportsQualityCompression = (mimeType: string): boolean => {
    return mimeType === 'image/jpeg' || mimeType === 'image/webp';
};

/**
 * Compress image using canvas
 *
 * @param dataUrl - Original image data URL
 * @param quality - Compression quality (0-1)
 * @param mimeType - Output MIME type
 * @returns Compressed image data URL
 */
const compressWithCanvas = (dataUrl: string, quality: number, mimeType: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Failed to get canvas context'));
                return;
            }

            // Draw image
            ctx.drawImage(img, 0, 0);

            // Convert to data URL with compression
            const compressed = canvas.toDataURL(mimeType, quality);
            resolve(compressed);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = dataUrl;
    });
};

export interface CompressionResult {
    dataUrl: string;
    originalSize: number;
    compressedSize: number;
    wasCompressed: boolean;
    quality?: number;
}

/**
 * Compress image if it exceeds the threshold
 *
 * - Images under 5MB: returned as-is
 * - Images over 5MB: compressed to fit under 5.5MB
 * - PNG with transparency: converted to JPEG (transparency lost)
 * - Quality starts at 0.92 and decreases until target size is met
 *
 * @param dataUrl - Image data URL (data:image/...;base64,...)
 * @returns Compression result with original and compressed sizes
 */
export const compressImageIfNeeded = async (dataUrl: string): Promise<CompressionResult> => {
    const originalSize = getBase64Size(dataUrl);

    // Under threshold - no compression needed
    if (originalSize <= COMPRESSION_THRESHOLD) {
        return {
            dataUrl,
            originalSize,
            compressedSize: originalSize,
            wasCompressed: false,
        };
    }

    const originalMimeType = getMimeType(dataUrl);

    // Use JPEG for compression (better compression ratio)
    // PNG transparency will be lost, but for large images this is acceptable
    const outputMimeType = supportsQualityCompression(originalMimeType) ? originalMimeType : 'image/jpeg';

    let quality = INITIAL_QUALITY;
    let compressed = dataUrl;
    let compressedSize = originalSize;

    // Iteratively reduce quality until target size is reached
    while (compressedSize > TARGET_SIZE && quality >= MIN_QUALITY) {
        compressed = await compressWithCanvas(dataUrl, quality, outputMimeType);
        compressedSize = getBase64Size(compressed);

        if (compressedSize <= TARGET_SIZE) {
            break;
        }

        quality -= QUALITY_STEP;
    }

    // Log compression result for debugging
    const savedPercent = ((1 - compressedSize / originalSize) * 100).toFixed(1);
    console.log(
        `[imageCompression] ${(originalSize / 1024 / 1024).toFixed(2)}MB → ${(compressedSize / 1024 / 1024).toFixed(2)}MB (${savedPercent}% saved, quality: ${quality.toFixed(2)})`
    );

    return {
        dataUrl: compressed,
        originalSize,
        compressedSize,
        wasCompressed: true,
        quality,
    };
};

/**
 * Check if an image needs compression
 */
export const needsCompression = (dataUrl: string): boolean => {
    return getBase64Size(dataUrl) > COMPRESSION_THRESHOLD;
};

/**
 * Get human-readable size string
 */
export const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};
