/**
 * Processed Image Result
 */
export interface ProcessedImage {
    base64: string;
    width: number;
    height: number;
    orientation: 'landscape' | 'portrait';
}

/**
 * processImage
 * - Processes an image file by applying rotation, flipping, center-cropping to 4:3 or 3:4 aspect ratio,
 *
 * @param file the image file or base64 string to process
 * @param options optional parameters.
 * @returns
 */
export const processImage = (
    file: File | string,
    options?: {
        /** rotation in degrees (0, 90, 180, 270) */
        rotation?: number;
        /** flip image horizontally */
        flipHorizontal?: boolean;
        /** flip image vertically */
        flipVertical?: boolean;
    }
): Promise<ProcessedImage> => {
    const rotation: number = options?.rotation ?? 0;
    const flipHorizontal: boolean = options?.flipHorizontal ?? false;
    const flipVertical: boolean = options?.flipVertical ?? false;

    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = typeof file === 'string' ? file : URL.createObjectURL(file);

        img.onload = () => {
            if (url) URL.revokeObjectURL(url);

            // 1. Create an intermediate canvas to handle rotation
            const rotateCanvas = document.createElement('canvas');
            const rotateCtx = rotateCanvas.getContext('2d');

            if (!rotateCtx) {
                reject(new Error('Could not get canvas context'));
                return;
            }

            // Swap dimensions if rotating 90 or 270 degrees
            const isRotated90or270 = rotation === 90 || rotation === 270;
            const rotatedWidth = isRotated90or270 ? img.height : img.width;
            const rotatedHeight = isRotated90or270 ? img.width : img.height;

            rotateCanvas.width = rotatedWidth;
            rotateCanvas.height = rotatedHeight;

            // Apply rotation
            rotateCtx.translate(rotateCanvas.width / 2, rotateCanvas.height / 2);
            rotateCtx.rotate((rotation * Math.PI) / 180);
            rotateCtx.drawImage(img, -img.width / 2, -img.height / 2);

            // 2. Determine Orientation and Target Ratio
            // If width > height => Landscape (4:3)
            // If height >= width => Portrait (3:4)
            const isLandscape = rotatedWidth > rotatedHeight;
            const targetRatio = isLandscape ? 4 / 3 : 3 / 4;
            const orientation = isLandscape ? 'landscape' : 'portrait';

            // 3. Calculate Crop Coordinates (Center Crop)
            const sourceRatio = rotatedWidth / rotatedHeight;
            let srcX = 0;
            let srcY = 0;
            let srcW = rotatedWidth;
            let srcH = rotatedHeight;

            if (sourceRatio > targetRatio) {
                // Image is wider than target - Crop Width (Sides)
                srcW = rotatedHeight * targetRatio;
                srcX = (rotatedWidth - srcW) / 2;
            } else if (sourceRatio == targetRatio) {
                // Perfect match - No crop needed
            } else {
                // Image is taller than target - Crop Height (Top/Bottom)
                srcH = rotatedWidth / targetRatio;
                srcY = (rotatedHeight - srcH) / 2;
            }

            // 4. Resize Logic (Max 1024px on longest side)
            const MAX_SIZE = 1024;
            let targetWidth = srcW;
            let targetHeight = srcH;

            if (isLandscape) {
                if (targetWidth > MAX_SIZE) {
                    const scale = MAX_SIZE / targetWidth;
                    targetWidth = MAX_SIZE;
                    targetHeight = targetHeight * scale;
                }
            } else {
                if (targetHeight > MAX_SIZE) {
                    const scale = MAX_SIZE / targetHeight;
                    targetHeight = MAX_SIZE;
                    targetWidth = targetWidth * scale;
                }
            }

            // 5. Final Canvas
            const finalCanvas = document.createElement('canvas');
            const finalCtx = finalCanvas.getContext('2d');
            if (!finalCtx) {
                reject(new Error('Could not get final canvas context'));
                return;
            }

            finalCanvas.width = targetWidth;
            finalCanvas.height = targetHeight;

            // Apply Flips (Mirroring)
            // We apply this to the final context so it mirrors the "view" of the image
            finalCtx.save();
            finalCtx.translate(targetWidth / 2, targetHeight / 2);
            finalCtx.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
            finalCtx.translate(-targetWidth / 2, -targetHeight / 2);

            // Draw from the rotated canvas to the final cropped/resized canvas
            finalCtx.drawImage(
                rotateCanvas,
                srcX,
                srcY,
                srcW,
                srcH, // Source from rotated canvas
                0,
                0,
                targetWidth,
                targetHeight // Destination
            );

            finalCtx.restore();

            // Compress to JPEG 0.8 (Higher quality for better small object detection)
            const base64 = finalCanvas.toDataURL('image/jpeg', 0.8);
            // const base64 = finalCanvas.toDataURL('image/png');

            resolve({
                base64,
                width: Math.round(targetWidth),
                height: Math.round(targetHeight),
                orientation,
            });
        };

        img.onerror = err => reject(err);
        img.src = url;
    });
};
