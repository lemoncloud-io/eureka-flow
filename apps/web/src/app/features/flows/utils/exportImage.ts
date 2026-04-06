import { toPng } from 'html-to-image';

import { api } from '@flows/web-core';

const PNG_PIXEL_RATIO = 2;
const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const isCrossOrigin = (src: string): boolean => {
    if (!src || src.startsWith('data:') || src.startsWith('blob:')) return false;
    try {
        return new URL(src).origin !== window.location.origin;
    } catch {
        return false;
    }
};

/**
 * Fetch an image as data URL, bypassing CORS.
 * 1. Try direct fetch (works for same-origin or CORS-enabled resources)
 * 2. Fall back to server proxy endpoint
 */
const fetchImageAsDataUrl = async (url: string): Promise<string | null> => {
    try {
        const resp = await fetch(url);
        if (!resp.ok) return null;
        const blob = await resp.blob();
        return await blobToDataUrl(blob);
    } catch {
        // CORS blocked — try server proxy
    }

    try {
        const { data } = await api.get<{ body: string; headers: { 'Content-Type': string } }>('/nodes/0/image', {
            params: { s3Url: url },
        });
        const contentType = data.headers?.['Content-Type'] || 'image/png';
        return `data:${contentType};base64,${data.body}`;
    } catch {
        return null;
    }
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });

/**
 * Replace cross-origin <img> srcs with inlined data URLs.
 * Returns a map of originals for restoration after export.
 */
const inlineCrossOriginImages = async (container: HTMLElement): Promise<Map<HTMLImageElement, string>> => {
    const originals = new Map<HTMLImageElement, string>();
    const images = Array.from(container.querySelectorAll<HTMLImageElement>('img'));
    const crossOriginImgs = images.filter(img => isCrossOrigin(img.src));

    if (crossOriginImgs.length === 0) return originals;

    await Promise.allSettled(
        crossOriginImgs.map(async img => {
            const originalSrc = img.src;
            const dataUrl = await fetchImageAsDataUrl(originalSrc);
            if (dataUrl) {
                originals.set(img, originalSrc);
                img.src = dataUrl;
            }
        })
    );

    return originals;
};

const restoreImages = (originals: Map<HTMLImageElement, string>): void => {
    originals.forEach((src, img) => {
        img.src = src;
    });
};

/**
 * Capture the canvas as a data URL, filtering out overlay elements.
 * Pre-converts cross-origin images to data URLs to avoid CORS failures.
 */
export const captureCanvasAsDataUrl = async (canvasElement: HTMLElement): Promise<string> => {
    const originals = await inlineCrossOriginImages(canvasElement);

    try {
        return await toPng(canvasElement, {
            cacheBust: false,
            backgroundColor: undefined,
            pixelRatio: PNG_PIXEL_RATIO,
            filter: (node: HTMLElement) => !node.hasAttribute?.('data-canvas-overlay'),
            imagePlaceholder: TRANSPARENT_PIXEL,
        });
    } finally {
        restoreImages(originals);
    }
};

/**
 * Capture the canvas as PNG and download as file.
 */
export const exportCanvasAsPng = async (canvasElement: HTMLElement, fileName: string): Promise<void> => {
    const dataUrl = await captureCanvasAsDataUrl(canvasElement);

    const link = document.createElement('a');
    link.download = `${fileName}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
