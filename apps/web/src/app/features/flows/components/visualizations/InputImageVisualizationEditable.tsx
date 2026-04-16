import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Expand, Loader2, Play, ScrollText, X } from 'lucide-react';

import { compressImageIfNeeded } from '@flows/flows';

import { INPUT_FILE_ACCEPT, clearFileConfig, processUploadedFile } from '../../utils';
import { FilePreviewDialog } from '../FilePreviewDialog';
import { S3Image } from '../S3Image';

import type { EditableVisualizationProps } from './types';

export const InputImageVisualizationEditable: React.FC<EditableVisualizationProps> = ({ node, onConfigChange }) => {
    const { t } = useTranslation(['nodes']);
    const [isUploading, setIsUploading] = useState(false);
    const [isFilePreviewOpen, setIsFilePreviewOpen] = useState(false);

    const img = node.config?.imageData as string | undefined;
    const fileData = node.config?.fileData as string | undefined;
    const fileName = node.config?.fileName as string | undefined;
    const fileInputId = `inline-image-${node.id}`;

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            await processUploadedFile(file, onConfigChange, async dataUrl => {
                const { dataUrl: compressed } = await compressImageIfNeeded(dataUrl);
                return compressed;
            });
        } finally {
            setIsUploading(false);
        }
        e.target.value = '';
    };

    const handleFileDelete = () => {
        clearFileConfig(onConfigChange);
    };

    const handleFileEdit = (newDataUrl: string) => {
        onConfigChange('fileData', newDataUrl);
    };

    return (
        <div
            onMouseDown={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}
            onWheel={e => e.stopPropagation()}
        >
            <input
                type="file"
                accept={INPUT_FILE_ACCEPT}
                className="hidden"
                id={fileInputId}
                onChange={handleFileUpload}
            />
            {isUploading ? (
                <div className="rounded-lg border border-dashed border-primary/60 overflow-hidden bg-black/20 h-24 flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    </div>
                </div>
            ) : img && !fileData ? (
                <div className="relative group rounded-lg border border-border overflow-hidden bg-black/20 min-h-[96px]">
                    <label
                        htmlFor={fileInputId}
                        className="block cursor-pointer flex items-center justify-center p-2"
                        title={t('visualization.clickToUpload')}
                    >
                        <S3Image src={img} className="max-w-full max-h-32 object-contain" alt="Input" />
                    </label>
                    <button
                        onClick={e => {
                            e.stopPropagation();
                            e.preventDefault();
                            onConfigChange('imageData', '');
                        }}
                        className="absolute top-1.5 right-1.5 p-1 bg-black/60 hover:bg-black/80 text-white rounded-md border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
                        title={t('visualization.removeImage')}
                    >
                        <X className="w-3 h-3" />
                    </button>
                </div>
            ) : fileData ? (
                <div className="relative group rounded-lg border border-border overflow-hidden bg-black/20">
                    <button
                        type="button"
                        onClick={() => setIsFilePreviewOpen(true)}
                        className="w-full flex items-center gap-2 p-3 text-left hover:bg-black/30 transition-colors"
                    >
                        <ScrollText className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-[11px] text-foreground/80 truncate flex-1">{fileName || 'file'}</span>
                        <Expand className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                    <button
                        onClick={e => {
                            e.stopPropagation();
                            e.preventDefault();
                            handleFileDelete();
                        }}
                        className="absolute top-1.5 right-1.5 p-1 bg-black/60 hover:bg-black/80 text-white rounded-md border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
                        title={t('visualization.removeImage')}
                    >
                        <X className="w-3 h-3" />
                    </button>
                    <FilePreviewDialog
                        open={isFilePreviewOpen}
                        onOpenChange={setIsFilePreviewOpen}
                        fileData={fileData}
                        fileName={fileName || 'file'}
                        onDelete={handleFileDelete}
                        onEdit={handleFileEdit}
                    />
                </div>
            ) : (
                <label
                    htmlFor={fileInputId}
                    className="block rounded-lg border border-dashed border-border overflow-hidden bg-black/20 h-24 cursor-pointer hover:border-primary/60 hover:bg-black/30 transition-all group"
                    title={t('visualization.clickToUpload')}
                >
                    <div className="h-full flex flex-col items-center justify-center gap-1">
                        <div className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                            <Play className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                        </div>
                        <span className="text-[10px] text-muted-foreground/70">{t('visualization.clickToUpload')}</span>
                    </div>
                </label>
            )}
        </div>
    );
};
