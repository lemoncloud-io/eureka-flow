export function processAndResizeImage(fileOrBlob: File | Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Failed to get 2D context'));
                    return;
                }

                // Center crop square
                const size = Math.min(img.width, img.height);
                const sx = (img.width - size) / 2;
                const sy = (img.height - size) / 2;

                const targetSize = 512;
                canvas.width = targetSize;
                canvas.height = targetSize;

                // High-quality rendering settings
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                // Draw center-cropped square resized to 512x512
                ctx.drawImage(img, sx, sy, size, size, 0, 0, targetSize, targetSize);

                // Output as base64 JPEG
                resolve(canvas.toDataURL('image/jpeg', 0.9));
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = e.target?.result as string;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(fileOrBlob);
    });
}

export function handleImagePaste(e: ClipboardEvent | React.ClipboardEvent): File | null {
    const items = 'clipboardData' in e ? e.clipboardData?.items : null;
    if (!items) return null;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            return items[i].getAsFile();
        }
    }
    return null;
}

export async function copyImageToClipboard(thumbnailUrl: string): Promise<boolean> {
    try {
        if (thumbnailUrl.startsWith('data:image')) {
            const res = await fetch(thumbnailUrl);
            const blob = await res.blob();
            // ClipboardItem accepts PNG better in some browsers
            if (blob.type === 'image/png' || blob.type === 'image/jpeg') {
                await navigator.clipboard.write([
                    new ClipboardItem({
                        [blob.type]: blob,
                    }),
                ]);
            } else {
                await navigator.clipboard.writeText(thumbnailUrl);
            }
            return true;
        } else {
            await navigator.clipboard.writeText(thumbnailUrl);
            return true;
        }
    } catch (err) {
        console.error('Failed to copy image to clipboard:', err);
        // Fallback to text copy
        try {
            await navigator.clipboard.writeText(thumbnailUrl);
            return true;
        } catch {
            return false;
        }
    }
}
