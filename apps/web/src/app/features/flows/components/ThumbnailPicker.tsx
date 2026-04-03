import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ImagePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { compressImageIfNeeded } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { Label } from '@flows/ui-kit';

interface ThumbnailPickerProps {
    value: string | null;
    onChange: (url: string | null) => void;
}

export const ThumbnailPicker = ({ value, onChange }: ThumbnailPickerProps) => {
    const { t } = useTranslation(['flows']);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isCompressing, setIsCompressing] = useState(false);

    const handleSelect = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    setIsCompressing(true);
                    const dataUrl = reader.result as string;
                    const { dataUrl: compressed } = await compressImageIfNeeded(dataUrl);
                    onChange(compressed);
                } catch {
                    toast.error(t('publish.thumbnailError', 'Failed to process image'));
                } finally {
                    setIsCompressing(false);
                }
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        },
        [onChange, t]
    );

    const handleRemove = useCallback(() => {
        onChange(null);
    }, [onChange]);

    return (
        <div className="space-y-1.5">
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
                    disabled={isCompressing}
                >
                    <img src={value} alt="Thumbnail" className="w-full aspect-video object-cover" />
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
                    disabled={isCompressing}
                    className={cn(
                        'flex w-full flex-col items-center justify-center gap-2',
                        'rounded-lg border border-dashed border-muted-foreground/25',
                        'bg-muted/20 py-6 transition-colors',
                        'hover:border-muted-foreground/40 hover:bg-muted/30'
                    )}
                >
                    <ImagePlus className="w-6 h-6 text-muted-foreground/40" />
                    <span className="text-xs text-muted-foreground/60">
                        {isCompressing ? t('publish.compressing', 'Processing...') : t('publish.uploadThumbnail')}
                    </span>
                    <span className="text-[10px] text-muted-foreground/40">{t('publish.thumbnailHint')}</span>
                </button>
            )}
        </div>
    );
};
