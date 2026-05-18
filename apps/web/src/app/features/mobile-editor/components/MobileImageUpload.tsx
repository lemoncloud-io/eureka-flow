import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Camera, FileText, Image, Loader2, Upload, X } from 'lucide-react';

import { processImageWithConfig } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { Label } from '@flows/ui-kit';

import { S3Image } from '../../flows/components/S3Image';
import { INPUT_FILE_ACCEPT, clearFileConfig, processUploadedFile } from '../../flows/utils';

import type { NodeData } from '@lemoncloud/eureka-flows-api';

interface MobileImageUploadProps {
    node: NodeData;
    onConfigChange: (key: string, value: unknown) => void;
}

export const MobileImageUpload = ({ node, onConfigChange }: MobileImageUploadProps) => {
    const { t } = useTranslation(['flows']);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    const img = node.config?.imageData as string | undefined;
    const fileData = node.config?.fileData as string | undefined;
    const fileName = node.config?.fileName as string | undefined;

    const aspectRatio = node.config?.aspectRatio as string | undefined;
    const maxWidth = node.config?.maxWidth as string | undefined;
    const bypass = node.config?.bypass as string | undefined;

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            await processUploadedFile(file, onConfigChange, dataUrl =>
                processImageWithConfig(dataUrl, { aspectRatio, maxWidth, bypass })
            );
        } finally {
            setIsUploading(false);
            e.target.value = '';
        }
    };

    const handleRemove = () => {
        onConfigChange('imageData', '');
        clearFileConfig(onConfigChange);
    };

    const hasImage = !!img && !fileData;
    const hasFile = !!fileData;
    const isEmpty = !hasImage && !hasFile;

    return (
        <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">
                {t('detailPanel.fileOrImage', 'File / Image')}
            </Label>

            <input
                ref={fileInputRef}
                type="file"
                accept={INPUT_FILE_ACCEPT}
                className="hidden"
                onChange={handleFileUpload}
            />
            <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileUpload}
            />

            {isUploading && (
                <div className="h-32 rounded-xl border border-dashed border-primary/40 bg-primary/5 flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    <span className="text-sm text-primary">{t('detailPanel.uploading', 'Uploading...')}</span>
                </div>
            )}

            {!isUploading && hasImage && (
                <div className="space-y-2">
                    <div className="relative w-full h-40 rounded-xl border border-border bg-black/20 overflow-hidden">
                        <S3Image src={img} alt="Preview" className="w-full h-full object-contain" />
                        <button
                            onClick={handleRemove}
                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center active:scale-90 transition-transform"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className={cn(
                                'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium',
                                'bg-muted/50 hover:bg-muted active:scale-[0.98] transition-all border border-border/50'
                            )}
                        >
                            <Upload className="w-3.5 h-3.5" />
                            {t('detailPanel.changeFile', 'Change')}
                        </button>
                        <button
                            onClick={() => cameraInputRef.current?.click()}
                            className={cn(
                                'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium',
                                'bg-muted/50 hover:bg-muted active:scale-[0.98] transition-all border border-border/50'
                            )}
                        >
                            <Camera className="w-3.5 h-3.5" />
                            {t('detailPanel.takePhoto', 'Camera')}
                        </button>
                    </div>
                </div>
            )}

            {!isUploading && hasFile && (
                <div className="space-y-2">
                    <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/20">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{fileName || 'file'}</div>
                            <div className="text-[10px] text-muted-foreground">
                                {t('detailPanel.textFile', 'Text file')}
                            </div>
                        </div>
                        <button
                            onClick={handleRemove}
                            className="w-8 h-8 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center active:scale-90 transition-transform"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className={cn(
                            'w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium',
                            'bg-muted/50 hover:bg-muted active:scale-[0.98] transition-all border border-border/50'
                        )}
                    >
                        <Upload className="w-3.5 h-3.5" />
                        {t('detailPanel.changeFile', 'Change')}
                    </button>
                </div>
            )}

            {!isUploading && isEmpty && (
                <div className="space-y-2">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className={cn(
                            'w-full h-28 rounded-xl border-2 border-dashed border-border/60',
                            'flex flex-col items-center justify-center gap-2',
                            'hover:border-primary/40 hover:bg-primary/5 active:scale-[0.98] transition-all'
                        )}
                    >
                        <div className="w-10 h-10 rounded-full bg-muted/60 flex items-center justify-center">
                            <Image className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="text-center">
                            <div className="text-xs font-medium text-muted-foreground">
                                {t('detailPanel.clickToUpload', 'Tap to upload')}
                            </div>
                            <div className="text-[10px] text-muted-foreground/50">
                                {t('detailPanel.supportedFormats', 'Images, ZIP, TXT, HTML, JSON')}
                            </div>
                        </div>
                    </button>
                    <button
                        onClick={() => cameraInputRef.current?.click()}
                        className={cn(
                            'w-full flex items-center justify-center gap-2 py-3 rounded-xl',
                            'bg-primary/10 text-primary text-sm font-medium',
                            'active:scale-[0.98] transition-all'
                        )}
                    >
                        <Camera className="w-4 h-4" />
                        {t('detailPanel.takePhoto', 'Camera')}
                    </button>
                </div>
            )}
        </div>
    );
};
