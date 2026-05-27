import { Fragment, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { Check, CheckCircle2, Copy, Edit2, ImagePlus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import {
    calculateProgress,
    getNextAction,
    getStageUnresolvedNotesCount,
    isItemComplete,
    useActors,
    useChangeStageStatusMutation,
    useDeleteItemMutation,
    useHydrateItemStages,
    useItem,
    useUpdateItemMutation,
} from '@flows/flows';
import { cn } from '@flows/lib/utils';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
    Button,
    Input,
} from '@flows/ui-kit';

import { ItemNotesList } from '../components/ItemNotesList';
import { NextActionCTA } from '../components/NextActionCTA';
import { ProgressBar } from '../components/ProgressBar';
import { StageCard } from '../components/StageCard';
import { StageDetailPanel } from '../components/StageDetailPanel';
import { STATUS_CONFIG } from '../components/StatusBadge';
import { copyImageToClipboard, handleImagePaste, processAndResizeImage } from '../utils/image';

import type { Status } from '@flows/flows';

export const ItemDetailPage = () => {
    const { t } = useTranslation();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { data: itemData, isLoading } = useItem(id ?? null);
    const { data: actorsData } = useActors();
    const changeStatusMutation = useChangeStageStatusMutation();
    const deleteItemMutation = useDeleteItemMutation();
    const updateItemMutation = useUpdateItemMutation();
    const [activeTab, setActiveTab] = useState<'stages' | 'notes'>('stages');
    const [memoDraft, setMemoDraft] = useState<string | null>(null);
    const isEditingMemo = memoDraft !== null;

    const [nameDraft, setNameDraft] = useState<string | null>(null);
    const isEditingName = nameDraft !== null;
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const selectedStageId = searchParams.get('stage');

    const handleDelete = () => {
        if (!id) return;
        deleteItemMutation.mutate(id, {
            onSuccess: () => {
                navigate('/items', { replace: true });
                toast.success(t('navigator.itemDeleted', 'Item deleted'));
            },
        });
    };

    const item = itemData?.data;
    useHydrateItemStages(item);
    const actors = useMemo(() => actorsData?.data ?? [], [actorsData?.data]);
    const actorMap = useMemo(() => new Map(actors.map(a => [a.id, a.name])), [actors]);

    const handleStatusChange = (stageId: string, status: Status) => {
        const stageName = item?.stages.find(s => s.id === stageId)?.name ?? '';
        changeStatusMutation.mutate(
            { id: stageId, input: { status } },
            {
                onSuccess: result => {
                    (result.warnings ?? []).forEach(w => toast.warning(w));
                    toast.success(`${stageName} → ${STATUS_CONFIG[status].label}`);
                },
            }
        );
    };

    const handleStageSelect = useCallback(
        (stageId: string) => {
            const params = new URLSearchParams(searchParams);
            params.set('stage', stageId);
            setSearchParams(params, { replace: false });
        },
        [searchParams, setSearchParams]
    );

    const handleStageClose = useCallback(() => {
        const params = new URLSearchParams(searchParams);
        params.delete('stage');
        setSearchParams(params, { replace: true });
    }, [searchParams, setSearchParams]);

    const handleStartEditMemo = () => setMemoDraft(item?.memo ?? '');
    const handleCancelEditMemo = () => setMemoDraft(null);
    const handleSaveMemo = () => {
        if (!id || memoDraft === null) return;
        updateItemMutation.mutate({ id, input: { memo: memoDraft } }, { onSuccess: () => setMemoDraft(null) });
    };

    const handleStartEditName = () => setNameDraft(item?.name ?? '');
    const handleCancelEditName = () => setNameDraft(null);
    const handleSaveName = () => {
        if (!id || nameDraft === null || !nameDraft.trim()) return;
        updateItemMutation.mutate({ id, input: { name: nameDraft.trim() } }, { onSuccess: () => setNameDraft(null) });
    };

    const handleThumbnailUpload = async (fileOrBlob: File | Blob) => {
        try {
            const resized = await processAndResizeImage(fileOrBlob);
            updateItemMutation.mutate(
                { id: id!, input: { thumbnailUrl: resized } },
                {
                    onSuccess: () => {
                        toast.success(t('navigator.imageUploaded', 'Image processed successfully!'));
                    },
                }
            );
        } catch {
            toast.error(t('navigator.imageError', 'Failed to process image.'));
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
            await handleThumbnailUpload(file);
        }
    };

    const handlePaste = async (e: React.ClipboardEvent) => {
        const file = handleImagePaste(e);
        if (file) {
            await handleThumbnailUpload(file);
        }
    };

    const handleCopyThumbnail = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!item?.thumbnailUrl) return;
        const success = await copyImageToClipboard(item.thumbnailUrl);
        if (success) {
            toast.success(t('navigator.imageCopied', 'Image copied to clipboard!'));
        } else {
            toast.error(t('navigator.copyFailed', 'Failed to copy image.'));
        }
    };

    const handleDeleteThumbnail = async (e: React.MouseEvent) => {
        e.stopPropagation();
        updateItemMutation.mutate(
            { id: id!, input: { thumbnailUrl: '' } },
            {
                onSuccess: () => {
                    toast.success(t('navigator.imageDeleted', 'Image removed.'));
                },
            }
        );
    };

    if (isLoading || !item) {
        return (
            <div className="space-y-6">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="h-10 w-48 animate-pulse rounded bg-muted" />
                <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
                    ))}
                </div>
            </div>
        );
    }

    const progress = calculateProgress(item);
    const nextAction = getNextAction(item);
    const currentStage = item.stages.find(s => s.status === 'doing');
    const totalNoteCount = item.stages.reduce((sum, s) => sum + s.notes.length, 0);
    const stageNameMap = new Map(item.stages.map(s => [s.id, s.name]));
    const metaEntries = item.$meta ? Object.entries(item.$meta) : [];

    return (
        <div className="space-y-5">
            <div className="flex items-start gap-4">
                <div
                    tabIndex={0}
                    className={cn(
                        'group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted outline-none transition-all cursor-pointer select-none',
                        isDragging
                            ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                            : 'hover:border-primary/50 hover:bg-muted/10'
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
                        onChange={async e => {
                            const file = e.target.files?.[0];
                            if (file) await handleThumbnailUpload(file);
                        }}
                    />
                    {item.thumbnailUrl ? (
                        <>
                            <img
                                src={item.thumbnailUrl}
                                alt={item.name}
                                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                            />
                            <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 text-white hover:bg-white/20"
                                    onClick={handleCopyThumbnail}
                                    title={t('navigator.copyImage', 'Copy Image')}
                                >
                                    <Copy className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 text-destructive hover:bg-destructive/20 hover:text-destructive"
                                    onClick={handleDeleteThumbnail}
                                    title={t('navigator.deleteImage', 'Remove')}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex h-full w-full items-center justify-center bg-primary/10 text-primary text-2xl font-bold transition-transform group-hover:scale-105">
                                {item.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100 text-white text-[10px]">
                                <ImagePlus className="h-4 w-4 mb-0.5" />
                                <span>{t('navigator.upload', 'Upload')}</span>
                            </div>
                        </>
                    )}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                    {isEditingName ? (
                        <div className="flex items-center gap-1.5">
                            <Input
                                value={nameDraft ?? ''}
                                onChange={e => setNameDraft(e.target.value)}
                                placeholder={t('navigator.itemNamePlaceholder', 'Item name')}
                                className="h-9 max-w-md text-lg font-semibold"
                                autoFocus
                                onKeyDown={e => {
                                    if (e.key === 'Enter') handleSaveName();
                                    if (e.key === 'Escape') handleCancelEditName();
                                }}
                            />
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
                                onClick={handleSaveName}
                                disabled={updateItemMutation.isPending}
                            >
                                <Check className="h-4 w-4" />
                            </Button>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-muted-foreground"
                                onClick={handleCancelEditName}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 group/title">
                            <h1
                                className="text-2xl font-bold truncate cursor-pointer hover:text-primary transition-colors"
                                onDoubleClick={handleStartEditName}
                                title={t('navigator.doubleClickToEdit', 'Double click to edit')}
                            >
                                {item.name}
                            </h1>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 opacity-0 group-hover/title:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                                onClick={handleStartEditName}
                                title={t('navigator.editName', 'Edit Name')}
                            >
                                <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    )}
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        {currentStage && <span>{currentStage.name}</span>}
                        {currentStage && <span>·</span>}
                        <ProgressBar value={progress} className="h-1.5 w-24" />
                    </div>
                    {isEditingMemo ? (
                        <div className="flex items-center gap-1.5">
                            <Input
                                value={memoDraft ?? ''}
                                onChange={e => setMemoDraft(e.target.value)}
                                placeholder={t('navigator.memoPlaceholder', 'Add memo...')}
                                className="h-8 max-w-md text-sm"
                                autoFocus
                                onKeyDown={e => {
                                    if (e.key === 'Enter') handleSaveMemo();
                                    if (e.key === 'Escape') handleCancelEditMemo();
                                }}
                            />
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-emerald-600 hover:text-emerald-700"
                                onClick={handleSaveMemo}
                                disabled={updateItemMutation.isPending}
                            >
                                <Check className="h-4 w-4" />
                            </Button>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground"
                                onClick={handleCancelEditMemo}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ) : (
                        <button
                            onClick={handleStartEditMemo}
                            className="group flex items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:border-border hover:bg-accent/30 hover:text-foreground"
                        >
                            <span className="max-w-md truncate">
                                {item.memo || t('navigator.addMemo', 'Add memo...')}
                            </span>
                            <Edit2 className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                        </button>
                    )}
                    {metaEntries.length > 0 && (
                        <dl className="grid max-w-md grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
                            {metaEntries.map(([key, val]) => (
                                <Fragment key={key}>
                                    <dt className="font-medium text-muted-foreground">{key}</dt>
                                    <dd className="truncate text-foreground">{val ?? '—'}</dd>
                                </Fragment>
                            ))}
                        </dl>
                    )}
                </div>
                <div className="hidden shrink-0 flex-col items-center justify-center rounded-xl border border-border bg-card px-5 py-3 text-center sm:flex">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {t('navigator.progress', 'Progress')}
                    </p>
                    <p className="text-3xl font-bold tabular-nums text-primary">{progress}%</p>
                </div>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{t('navigator.deleteItem', 'Delete item?')}</AlertDialogTitle>
                            <AlertDialogDescription>
                                {t(
                                    'navigator.deleteItemDesc',
                                    'This will permanently delete "{{name}}" and all its stages.',
                                    { name: item.name }
                                )}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleDelete}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                                {t('common.delete', 'Delete')}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>

            {isItemComplete(item) && (
                <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-500/20 dark:bg-green-500/10">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">
                        {t('navigator.itemComplete', 'All stages completed')}
                    </p>
                </div>
            )}

            {nextAction && (
                <NextActionCTA item={item} action={nextAction} onAction={stageId => handleStageSelect(stageId)} />
            )}

            <div className="border-b border-border">
                <div className="flex gap-0">
                    <button
                        onClick={() => setActiveTab('stages')}
                        className={cn(
                            'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                            activeTab === 'stages'
                                ? 'border-primary text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {t('navigator.stages', 'Stages')} ({item.stages.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('notes')}
                        className={cn(
                            'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                            activeTab === 'notes'
                                ? 'border-primary text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {t('navigator.notes', 'Notes')} ({totalNoteCount})
                    </button>
                </div>
            </div>

            {activeTab === 'stages' && (
                <div>
                    {item.stages.map((stage, index) => (
                        <StageCard
                            key={stage.id}
                            stage={stage}
                            actorName={actorMap.get(stage.actorId ?? '')}
                            unresolvedCount={getStageUnresolvedNotesCount(stage)}
                            isStatusChangePending={changeStatusMutation.isPending}
                            isLast={index === item.stages.length - 1}
                            dependencyNames={
                                stage.dependencyStageIds.map(id => stageNameMap.get(id)).filter(Boolean) as string[]
                            }
                            onStatusChange={handleStatusChange}
                            onSelect={handleStageSelect}
                        />
                    ))}
                </div>
            )}
            {activeTab === 'notes' && <ItemNotesList stages={item.stages} />}

            <StageDetailPanel
                item={item}
                stageId={selectedStageId}
                actors={actors}
                onClose={handleStageClose}
                onSelectStage={handleStageSelect}
            />
        </div>
    );
};
