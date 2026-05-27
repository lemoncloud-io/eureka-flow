import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Copy, ImagePlus, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { useApplyProcessMutation, useProcesses } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@flows/ui-kit';

import { copyImageToClipboard, handleImagePaste, processAndResizeImage } from '../utils/image';

export const NewItemDialog = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { data: processesData } = useProcesses();
    const applyMutation = useApplyProcessMutation();
    const [open, setOpen] = useState(false);
    const [selectedProcessId, setSelectedProcessId] = useState('');
    const [name, setName] = useState('');
    const [thumbnailUrl, setThumbnailUrl] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const processes = processesData?.data ?? [];

    const handleCreate = () => {
        if (!selectedProcessId || !name.trim()) return;
        applyMutation.mutate(
            {
                processId: selectedProcessId,
                input: { name: name.trim(), thumbnailUrl: thumbnailUrl || '', processId: selectedProcessId },
            },
            {
                onSuccess: result => {
                    setOpen(false);
                    setName('');
                    setThumbnailUrl('');
                    setSelectedProcessId('');
                    navigate(`/items/${result.data.id}`);
                    toast.success(t('navigator.itemCreated', 'Item created!'));
                },
            }
        );
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const resized = await processAndResizeImage(file);
                setThumbnailUrl(resized);
                toast.success(t('navigator.imageUploaded', 'Image processed successfully!'));
            } catch {
                toast.error(t('navigator.imageError', 'Failed to process image.'));
            }
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) {
            try {
                const resized = await processAndResizeImage(file);
                setThumbnailUrl(resized);
                toast.success(t('navigator.imageUploaded', 'Image processed successfully!'));
            } catch {
                toast.error(t('navigator.imageError', 'Failed to process image.'));
            }
        }
    };

    const handlePaste = async (e: React.ClipboardEvent) => {
        const file = handleImagePaste(e);
        if (file) {
            try {
                const resized = await processAndResizeImage(file);
                setThumbnailUrl(resized);
                toast.success(t('navigator.imagePasted', 'Image pasted from clipboard!'));
            } catch {
                toast.error(t('navigator.imageError', 'Failed to process image.'));
            }
        }
    };

    const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!thumbnailUrl) return;
        const success = await copyImageToClipboard(thumbnailUrl);
        if (success) {
            toast.success(t('navigator.imageCopied', 'Image copied to clipboard!'));
        } else {
            toast.error(t('navigator.copyFailed', 'Failed to copy image.'));
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={next => {
                setOpen(next);
                if (!next) {
                    setName('');
                    setThumbnailUrl('');
                    setSelectedProcessId('');
                }
            }}
        >
            <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    {t('navigator.newItem', 'New Item')}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('navigator.newItem', 'New Item')}</DialogTitle>
                    <DialogDescription>
                        {t('navigator.newItemDesc', 'Select a process template and give your item a name.')}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">{t('navigator.process', 'Process')}</label>
                        {processes.length > 0 ? (
                            <Select value={selectedProcessId} onValueChange={setSelectedProcessId}>
                                <SelectTrigger>
                                    <SelectValue placeholder={t('navigator.selectProcess', 'Select a process...')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {processes.map(p => (
                                        <SelectItem key={p.id} value={p.id}>
                                            {p.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                {t('navigator.noProcesses', 'No process templates available.')}
                            </p>
                        )}
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">{t('navigator.itemName', 'Name')}</label>
                        <Input
                            placeholder={t('navigator.itemNamePlaceholder', 'e.g. Sprint 12 onboarding')}
                            value={name}
                            onChange={e => setName(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && selectedProcessId && name.trim()) handleCreate();
                            }}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">
                            {t('navigator.thumbnail', 'Thumbnail Image (1:1 Ratio, Max 512px)')}
                        </label>
                        <div
                            tabIndex={0}
                            className={cn(
                                'relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center outline-none transition-all cursor-pointer h-32',
                                isDragging
                                    ? 'border-primary bg-primary/5'
                                    : 'border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/10',
                                thumbnailUrl ? 'border-none p-0' : ''
                            )}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onPaste={handlePaste}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/*"
                                onChange={handleFileChange}
                            />
                            {thumbnailUrl ? (
                                <div className="group relative h-full w-full overflow-hidden rounded-lg">
                                    <img
                                        src={thumbnailUrl}
                                        alt="Thumbnail Preview"
                                        className="h-full w-full object-cover"
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 text-white hover:bg-white/20"
                                            onClick={handleCopy}
                                            title={t('navigator.copyImage', 'Copy Image')}
                                        >
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 text-destructive hover:bg-destructive/20 hover:text-destructive"
                                            onClick={e => {
                                                e.stopPropagation();
                                                setThumbnailUrl('');
                                            }}
                                            title={t('navigator.deleteImage', 'Remove')}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
                                    <ImagePlus className="h-7 w-7 text-muted-foreground/60" />
                                    <p className="text-xs font-semibold">
                                        {t('navigator.clickOrDrag', 'Drag image, Paste (Ctrl+V) or Click')}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground/60">
                                        {t('navigator.imageSpec', '1:1 ratio, max 512px (Auto-resized)')}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        onClick={handleCreate}
                        disabled={!selectedProcessId || !name.trim() || applyMutation.isPending}
                    >
                        {applyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('navigator.create', 'Create')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
