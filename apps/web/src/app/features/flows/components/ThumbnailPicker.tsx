import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { processThumbnail } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { Label } from '@flows/ui-kit';

interface ThumbnailPickerProps {
    value: string | null;
    onChange: (url: string | null) => void;
    isLoading?: boolean;
}

export const ThumbnailPicker = ({ value, onChange, isLoading }: ThumbnailPickerProps) => {
    const { t } = useTranslation(['flows']);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const isBusy = isProcessing || isLoading;

    const handleImageData = useCallback(
        async (dataUrl: string) => {
            try {
                setIsProcessing(true);
                const processed = await processThumbnail(dataUrl);
                onChange(processed);
            } catch {
                toast.error(t('publish.thumbnailError', 'Failed to process image'));
            } finally {
                setIsProcessing(false);
            }
        },
        [onChange, t]
    );

    const handleSelect = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result as string;
                handleImageData(dataUrl);
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        },
        [handleImageData]
    );

    const handlePaste = useCallback(
        (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (const item of Array.from(items)) {
                if (!item.type.startsWith('image/')) continue;

                e.preventDefault();
                const file = item.getAsFile();
                if (!file) continue;

                const reader = new FileReader();
                reader.onload = () => {
                    const dataUrl = reader.result as string;
                    handleImageData(dataUrl);
                };
                reader.readAsDataURL(file);
                return;
            }
        },
        [handleImageData]
    );

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        el.addEventListener('paste', handlePaste);
        return () => el.removeEventListener('paste', handlePaste);
    }, [handlePaste]);

    const handleRemove = useCallback(() => {
        onChange(null);
    }, [onChange]);

    return (
        <div ref={containerRef} className="space-y-1.5" tabIndex={-1}>
            <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground">{t('publish.thumbnail')}</Label>
                {value && (
                    <button
                        type="button"
                        onClick={handleRemove}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-destructive transition-colors"
                    >
                        <Trash2 className="w-3 h-3" />
                        {t('publish.removeThumbnail')}
                    </button>
                )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleSelect} className="hidden" />
            {value ? (
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="group relative w-full overflow-hidden rounded-lg border"
                    disabled={isProcessing}
                >
                    <img src={value} alt="Thumbnail" className="w-full aspect-[4/3] object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
                        <span className="text-xs font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity">
                            {t('publish.changeThumbnail')}
                        </span>
                    </div>
                </button>
            ) : (
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isBusy}
                    className={cn(
                        'flex w-full flex-col items-center justify-center gap-2',
                        'rounded-lg border border-dashed border-muted-foreground/25',
                        'bg-muted/20 py-6 transition-colors',
                        'hover:border-muted-foreground/40 hover:bg-muted/30'
                    )}
                >
                    {isBusy ? (
                        <Loader2 className="w-6 h-6 text-muted-foreground/40 animate-spin" />
                    ) : (
                        <ImagePlus className="w-6 h-6 text-muted-foreground/40" />
                    )}
                    <span className="text-xs text-muted-foreground/60">
                        {isBusy ? t('publish.compressing', 'Processing...') : t('publish.uploadThumbnail')}
                    </span>
                    {!isBusy && (
                        <span className="text-[10px] text-muted-foreground/40">{t('publish.thumbnailHint')}</span>
                    )}
                </button>
            )}
        </div>
    );
};
