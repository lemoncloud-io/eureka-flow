import { toPng } from 'html-to-image';

const PNG_PIXEL_RATIO = 2;

/**
 * Capture the canvas as PNG, filtering out overlay elements, then download.
 * Uses html-to-image's filter option to exclude overlays from the cloned DOM.
 */
export const exportCanvasAsPng = async (canvasElement: HTMLElement, fileName: string): Promise<void> => {
    const dataUrl = await toPng(canvasElement, {
        cacheBust: true,
        backgroundColor: undefined,
        pixelRatio: PNG_PIXEL_RATIO,
        filter: (node: HTMLElement) => !node.hasAttribute?.('data-canvas-overlay'),
    });

    const link = document.createElement('a');
    link.download = `${fileName}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
