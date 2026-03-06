import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';

import { RotateCcw } from 'lucide-react';

import { compressImageIfNeeded } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { Dialog, DialogContent } from '@flows/ui-kit';

import 'react-image-crop/dist/ReactCrop.css';

import type { Crop, PixelCrop } from 'react-image-crop';

/** Maximum output width in pixels */
const MAX_OUTPUT_WIDTH = 1250;

/** JPEG quality for output */
const OUTPUT_QUALITY = 0.9;

interface AspectRatioPreset {
    label: string;
    value: number | undefined;
}

const ASPECT_RATIOS: AspectRatioPreset[] = [
    { label: 'Free', value: undefined },
    { label: '1:1', value: 1 },
    { label: '4:3', value: 4 / 3 },
    { label: '3:4', value: 3 / 4 },
    { label: '16:9', value: 16 / 9 },
];

interface ImageEditorDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    imageSrc: string;
    onSave: (croppedImageDataUrl: string) => void;
}

/**
 * Get cropped image as data URL
 */
const getCroppedImage = (image: HTMLImageElement, crop: PixelCrop): string => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        throw new Error('Failed to get canvas context');
    }

    // Calculate scale between displayed image and natural size
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    // Calculate actual pixel crop on original image
    const pixelCrop = {
        x: crop.x * scaleX,
        y: crop.y * scaleY,
        width: crop.width * scaleX,
        height: crop.height * scaleY,
    };

    // Calculate output dimensions respecting max width
    let outputWidth = pixelCrop.width;
    let outputHeight = pixelCrop.height;

    if (outputWidth > MAX_OUTPUT_WIDTH) {
        const ratio = MAX_OUTPUT_WIDTH / outputWidth;
        outputWidth = MAX_OUTPUT_WIDTH;
        outputHeight = Math.round(pixelCrop.height * ratio);
    }

    canvas.width = outputWidth;
    canvas.height = outputHeight;

    // Draw cropped and resized image
    ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, outputWidth, outputHeight);

    return canvas.toDataURL('image/jpeg', OUTPUT_QUALITY);
};

/**
 * Create initial centered crop
 */
const createInitialCrop = (mediaWidth: number, mediaHeight: number, aspect: number | undefined): Crop => {
    if (aspect) {
        return centerCrop(
            makeAspectCrop(
                {
                    unit: '%',
                    width: 80,
                },
                aspect,
                mediaWidth,
                mediaHeight
            ),
            mediaWidth,
            mediaHeight
        );
    }

    // Free crop - start with 80% centered
    return {
        unit: '%',
        x: 10,
        y: 10,
        width: 80,
        height: 80,
    };
};

export const ImageEditorDialog: React.FC<ImageEditorDialogProps> = ({ open, onOpenChange, imageSrc, onSave }) => {
    const { t } = useTranslation(['flows']);

    const imgRef = useRef<HTMLImageElement | null>(null);
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
    const [selectedRatioIndex, setSelectedRatioIndex] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);
    const [outputSize, setOutputSize] = useState<{ width: number; height: number } | null>(null);

    const aspect = ASPECT_RATIOS[selectedRatioIndex].value;

    // Calculate output size whenever crop changes
    useEffect(() => {
        if (completedCrop && imgRef.current) {
            const image = imgRef.current;
            const scaleX = image.naturalWidth / image.width;
            const scaleY = image.naturalHeight / image.height;

            let width = Math.round(completedCrop.width * scaleX);
            let height = Math.round(completedCrop.height * scaleY);

            if (width > MAX_OUTPUT_WIDTH) {
                const ratio = MAX_OUTPUT_WIDTH / width;
                width = MAX_OUTPUT_WIDTH;
                height = Math.round(height * ratio);
            }

            setOutputSize({ width, height });
        }
    }, [completedCrop]);

    const handleImageLoad = useCallback(
        (e: React.SyntheticEvent<HTMLImageElement>) => {
            const { width, height } = e.currentTarget;
            const initialCrop = createInitialCrop(width, height, aspect);
            setCrop(initialCrop);
        },
        [aspect]
    );

    const handleAspectChange = useCallback((index: number) => {
        setSelectedRatioIndex(index);
        const newAspect = ASPECT_RATIOS[index].value;

        if (imgRef.current) {
            const { width, height } = imgRef.current;
            const newCrop = createInitialCrop(width, height, newAspect);
            setCrop(newCrop);
        }
    }, []);

    const resetState = useCallback(() => {
        setSelectedRatioIndex(0);
        setCompletedCrop(undefined);
        setOutputSize(null);

        if (imgRef.current) {
            const { width, height } = imgRef.current;
            const initialCrop = createInitialCrop(width, height, undefined);
            setCrop(initialCrop);
        }
    }, []);

    const handleSave = useCallback(async () => {
        if (!completedCrop || !imgRef.current) return;

        setIsProcessing(true);
        try {
            const croppedDataUrl = getCroppedImage(imgRef.current, completedCrop);
            const { dataUrl: compressedDataUrl } = await compressImageIfNeeded(croppedDataUrl);

            onSave(compressedDataUrl);
            onOpenChange(false);
        } catch (error) {
            console.error('[ImageEditorDialog] Failed to crop image:', error);
        } finally {
            setIsProcessing(false);
        }
    }, [completedCrop, onSave, onOpenChange]);

    const handleCancel = useCallback(() => {
        onOpenChange(false);
    }, [onOpenChange]);

    // Reset state when dialog opens
    const handleOpenChange = useCallback(
        (newOpen: boolean) => {
            if (newOpen) {
                setCrop(undefined);
                setCompletedCrop(undefined);
                setSelectedRatioIndex(0);
                setOutputSize(null);
            }
            onOpenChange(newOpen);
        },
        [onOpenChange]
    );

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-3xl w-[95vw] p-0 gap-0 overflow-hidden rounded-xl">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-background">
                    <h2 className="text-sm font-semibold">{t('flows:imageEditor.title')}</h2>
                    <div className="flex items-center gap-2">
                        {outputSize && (
                            <span className="text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                {outputSize.width} × {outputSize.height}
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={resetState}
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title={t('flows:imageEditor.reset')}
                        >
                            <RotateCcw className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Crop Area */}
                <div
                    className="flex items-center justify-center bg-neutral-900 p-4"
                    style={{ height: 'min(60vh, 450px)' }}
                >
                    <ReactCrop
                        crop={crop}
                        onChange={(_, percentCrop) => setCrop(percentCrop)}
                        onComplete={c => setCompletedCrop(c)}
                        aspect={aspect}
                        style={{ maxHeight: '100%', maxWidth: '100%' }}
                    >
                        <img
                            ref={imgRef}
                            src={imageSrc}
                            alt="Crop"
                            onLoad={handleImageLoad}
                            style={{ maxHeight: 'calc(min(60vh, 450px) - 32px)', maxWidth: '100%', display: 'block' }}
                            crossOrigin="anonymous"
                        />
                    </ReactCrop>
                </div>

                {/* Controls */}
                <div className="px-4 py-3 bg-muted/30 border-t border-border/50">
                    {/* Aspect Ratio */}
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide w-14">
                            {t('flows:imageEditor.ratio')}
                        </span>
                        <div className="flex gap-1">
                            {ASPECT_RATIOS.map((ratio, index) => (
                                <button
                                    key={ratio.label}
                                    type="button"
                                    onClick={() => handleAspectChange(index)}
                                    className={cn(
                                        'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                                        selectedRatioIndex === index
                                            ? 'bg-primary text-primary-foreground shadow-sm'
                                            : 'bg-background hover:bg-muted text-muted-foreground hover:text-foreground border border-border/50'
                                    )}
                                >
                                    {ratio.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 bg-background">
                    <span className="text-[10px] text-muted-foreground">
                        {t('flows:imageEditor.maxWidthInfo', { width: MAX_OUTPUT_WIDTH })}
                    </span>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={handleCancel}
                            disabled={isProcessing}
                            className="px-4 py-2 text-sm font-medium rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-50"
                        >
                            {t('flows:imageEditor.cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={isProcessing || !completedCrop}
                            className={cn(
                                'px-5 py-2 text-sm font-medium rounded-md transition-colors',
                                'bg-primary text-primary-foreground hover:bg-primary/90',
                                'disabled:opacity-50 disabled:cursor-not-allowed',
                                'flex items-center gap-2 min-w-[80px] justify-center'
                            )}
                        >
                            {isProcessing ? (
                                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                            ) : (
                                t('flows:imageEditor.apply')
                            )}
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
