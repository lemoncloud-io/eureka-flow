import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Loader2, Upload, X } from 'lucide-react';

import { compressImageIfNeeded } from '@flows/flows';
import { cn } from '@flows/lib/utils';

interface MobileFileFieldProps {
    value: string;
    onChange: (value: string) => void;
}

export const MobileFileField = ({ value, onChange }: MobileFileFieldProps) => {
    const { t } = useTranslation(['flows']);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const reader = new FileReader();
        reader.onload = async evt => {
            try {
                if (evt.target?.result) {
                    const { dataUrl } = await compressImageIfNeeded(evt.target.result as string);
                    onChange(dataUrl);
                }
            } finally {
                setIsUploading(false);
            }
        };
        reader.onerror = () => setIsUploading(false);
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const hasValue = !!value && value.startsWith('data:');

    return (
        <div className="space-y-2">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />

            {isUploading ? (
                <div className="h-20 rounded-lg border border-dashed border-primary/40 bg-primary/5 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    <span className="text-xs text-primary">{t('detailPanel.uploading', 'Uploading...')}</span>
                </div>
            ) : hasValue ? (
                <div className="relative w-full h-28 rounded-lg border border-border bg-black/20 overflow-hidden">
                    <img src={value} alt="" className="w-full h-full object-contain" />
                    <button
                        onClick={() => onChange('')}
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            ) : null}

            <button
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                    'w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium',
                    'bg-muted/50 hover:bg-muted active:scale-[0.98] transition-all border border-border/50'
                )}
            >
                <Upload className="w-3.5 h-3.5" />
                {hasValue ? t('detailPanel.changeFile', 'Change') : t('detailPanel.uploadFile', 'Upload Image')}
            </button>
        </div>
    );
};
