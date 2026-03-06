import { useCallback, useEffect, useState } from 'react';
import Cropper from 'react-easy-crop';
import { useTranslation } from 'react-i18next';

import { Minus, Plus, RotateCcw } from 'lucide-react';

import { compressImageIfNeeded } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { Dialog, DialogContent } from '@flows/ui-kit';

import type { Area, Point } from 'react-easy-crop';

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
 * Creates an Image element from a URL
 */
const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const image = new Image();
        image.addEventListener('load', () => resolve(image));
        image.addEventListener('error', error => reject(error));
        image.setAttribute('crossOrigin', 'anonymous');
        image.src = url;
    });

/**
 * Crops the image and returns a data URL
 * Respects MAX_OUTPUT_WIDTH constraint
 */
const getCroppedImage = async (imageSrc: string, pixelCrop: Area): Promise<string> => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        throw new Error('Failed to get canvas context');
    }

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

export const ImageEditorDialog: React.FC<ImageEditorDialogProps> = ({ open, onOpenChange, imageSrc, onSave }) => {
    const { t } = useTranslation(['flows']);

    const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [selectedRatioIndex, setSelectedRatioIndex] = useState(0); // Default to "Free"
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [outputSize, setOutputSize] = useState<{ width: number; height: number } | null>(null);

    const aspect = ASPECT_RATIOS[selectedRatioIndex].value;

    // Calculate output size whenever crop changes
    useEffect(() => {
        if (croppedAreaPixels) {
            let width = Math.round(croppedAreaPixels.width);
            let height = Math.round(croppedAreaPixels.height);

            if (width > MAX_OUTPUT_WIDTH) {
                const ratio = MAX_OUTPUT_WIDTH / width;
                width = MAX_OUTPUT_WIDTH;
                height = Math.round(height * ratio);
            }

            setOutputSize({ width, height });
        }
    }, [croppedAreaPixels]);

    const handleCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    const handleZoomIn = useCallback(() => {
        setZoom(prev => Math.min(prev + 0.2, 3));
    }, []);

    const handleZoomOut = useCallback(() => {
        setZoom(prev => Math.max(prev - 0.2, 1));
    }, []);

    const resetState = useCallback(() => {
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setSelectedRatioIndex(0);
        setCroppedAreaPixels(null);
        setOutputSize(null);
    }, []);

    const handleSave = useCallback(async () => {
        if (!croppedAreaPixels) return;

        setIsProcessing(true);
        try {
            const croppedDataUrl = await getCroppedImage(imageSrc, croppedAreaPixels);
            const { dataUrl: compressedDataUrl } = await compressImageIfNeeded(croppedDataUrl);

            onSave(compressedDataUrl);
            onOpenChange(false);
        } catch (error) {
            console.error('[ImageEditorDialog] Failed to crop image:', error);
        } finally {
            setIsProcessing(false);
        }
    }, [croppedAreaPixels, imageSrc, onSave, onOpenChange]);

    const handleCancel = useCallback(() => {
        onOpenChange(false);
    }, [onOpenChange]);

    // Reset state when dialog opens
    const handleOpenChange = useCallback(
        (newOpen: boolean) => {
            if (newOpen) {
                resetState();
            }
            onOpenChange(newOpen);
        },
        [onOpenChange, resetState]
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
                            onClick={resetState}
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title={t('flows:imageEditor.reset')}
                        >
                            <RotateCcw className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Crop Area */}
                <div className="relative bg-neutral-900" style={{ height: 'min(60vh, 450px)' }}>
                    <Cropper
                        image={imageSrc}
                        crop={crop}
                        zoom={zoom}
                        aspect={aspect}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={handleCropComplete}
                        showGrid
                        cropShape="rect"
                        objectFit="contain"
                        style={{
                            containerStyle: {
                                backgroundColor: '#171717',
                            },
                            cropAreaStyle: {
                                border: '2px solid rgba(139, 92, 246, 0.8)',
                                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
                            },
                        }}
                    />
                </div>

                {/* Controls */}
                <div className="px-4 py-3 bg-muted/30 border-t border-border/50 space-y-3">
                    {/* Aspect Ratio */}
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide w-14">
                            {t('flows:imageEditor.ratio')}
                        </span>
                        <div className="flex gap-1">
                            {ASPECT_RATIOS.map((ratio, index) => (
                                <button
                                    key={ratio.label}
                                    onClick={() => setSelectedRatioIndex(index)}
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

                    {/* Zoom */}
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide w-14">
                            {t('flows:imageEditor.zoom')}
                        </span>
                        <div className="flex items-center gap-2 flex-1">
                            <button
                                onClick={handleZoomOut}
                                disabled={zoom <= 1}
                                className="p-1.5 rounded-md bg-background border border-border/50 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                <Minus className="w-3.5 h-3.5" />
                            </button>
                            <div className="flex-1 relative">
                                <input
                                    type="range"
                                    min={1}
                                    max={3}
                                    step={0.05}
                                    value={zoom}
                                    onChange={e => setZoom(Number(e.target.value))}
                                    className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md"
                                />
                            </div>
                            <button
                                onClick={handleZoomIn}
                                disabled={zoom >= 3}
                                className="p-1.5 rounded-md bg-background border border-border/50 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                <Plus className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-xs font-mono text-muted-foreground w-12 text-right">
                                {(zoom * 100).toFixed(0)}%
                            </span>
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
                            onClick={handleCancel}
                            disabled={isProcessing}
                            className="px-4 py-2 text-sm font-medium rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-50"
                        >
                            {t('flows:imageEditor.cancel')}
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isProcessing || !croppedAreaPixels}
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
