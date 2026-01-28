import { getImageFromS3 } from '../api';

/**
 * S3 URL pattern: s3://bucket/key
 */
const S3_URL_PATTERN = /^s3:\/\//;

/**
 * Check if a value is an S3 URL
 * @param value - Value to check
 * @returns true if value is an S3 URL (s3://...)
 */
export const isS3Url = (value: unknown): value is string => {
    return typeof value === 'string' && S3_URL_PATTERN.test(value);
};

/**
 * In-memory cache for resolved S3 images
 * Key: S3 URL, Value: Data URL
 */
const imageCache = new Map<string, string>();

/**
 * Pending requests map to prevent duplicate fetches
 */
const pendingRequests = new Map<string, Promise<string>>();

/**
 * Resolve an S3 URL to a data URL
 * Uses in-memory cache for performance
 *
 * @param s3Url - S3 reference (s3://bucket/key)
 * @returns Data URL (data:image/...;base64,...)
 */
export const resolveS3Image = async (s3Url: string): Promise<string> => {
    // Return cached result if available
    const cached = imageCache.get(s3Url);
    if (cached) {
        return cached;
    }

    // Return pending request if already in flight
    const pending = pendingRequests.get(s3Url);
    if (pending) {
        return pending;
    }

    // Create new request with proper cleanup on both success and error
    const request = getImageFromS3(s3Url)
        .then(dataUrl => {
            imageCache.set(s3Url, dataUrl);
            pendingRequests.delete(s3Url);
            return dataUrl;
        })
        .catch(err => {
            pendingRequests.delete(s3Url);
            throw err;
        });

    pendingRequests.set(s3Url, request);
    return request;
};

/**
 * Clear the S3 image cache
 * Useful for testing or memory management
 */
export const clearS3ImageCache = (): void => {
    imageCache.clear();
    pendingRequests.clear();
};

/**
 * Get cache size for debugging
 */
export const getS3ImageCacheSize = (): number => {
    return imageCache.size;
};

/**
 * Download an image from a data URL
 * @param dataUrl - Data URL or resolved image URL
 * @param filename - Optional filename (defaults to image-{timestamp}.png)
 */
export const downloadImage = (dataUrl: string, filename?: string): void => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename || `image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
