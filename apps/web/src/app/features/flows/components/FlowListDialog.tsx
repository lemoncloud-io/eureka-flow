import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Camera, FolderOpen, ImagePlus, MoreVertical, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { processThumbnail, useDeleteFlowMutation, useFlowsListQuery, useUpdateFlowMutation } from '@flows/flows';
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
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Input,
} from '@flows/ui-kit';

import { formatRelativeTime } from '../utils';

import type { FlowView } from '@flows/flows';

type FlowItemData = FlowView & { id: string; nodeCount: number };

const DROPDOWN_CLOSE_DELAY_MS = 100;

interface FlowListDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentFlowId: string | null;
    onSelectFlow: (flowId: string) => void;
    onNewFlow: () => void;
}

const FlowCard: React.FC<{
    flow: FlowItemData;
    isCurrent: boolean;
    onSelect: () => void;
    onDelete: () => void;
    onUpdateDescription: (description: string) => void;
    onRequestThumbnailUpload: () => void;
}> = ({ flow, isCurrent, onSelect, onDelete, onUpdateDescription, onRequestThumbnailUpload }) => {
    const { t } = useTranslation(['flows']);
    const [isEditingDesc, setIsEditingDesc] = useState(false);
    const [descDraft, setDescDraft] = useState(flow.description ?? '');

    // Sync draft with prop when flow data changes (e.g. after refetch)
    useEffect(() => {
        if (!isEditingDesc) {
            setDescDraft(flow.description ?? '');
        }
    }, [flow.description, isEditingDesc]);

    const handleDescSave = () => {
        setIsEditingDesc(false);
        if (descDraft !== (flow.description ?? '')) {
            onUpdateDescription(descDraft);
        }
    };

    return (
        <div
            className={cn(
                'group relative flex gap-3 p-3 rounded-lg border transition-colors cursor-pointer',
                'hover:bg-accent/50 hover:border-accent',
                isCurrent && 'border-primary/50 bg-primary/5'
            )}
            onClick={onSelect}
        >
            {/* Thumbnail */}
            <button
                type="button"
                className={cn(
                    'group/thumb shrink-0 w-20 h-14 rounded-md overflow-hidden relative',
                    'bg-muted/50 border border-border/50',
                    !flow.thumbnail && 'flex items-center justify-center'
                )}
                onClick={e => {
                    e.stopPropagation();
                    onRequestThumbnailUpload();
                }}
            >
                {flow.thumbnail ? (
                    <>
                        <img src={flow.thumbnail} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/thumb:bg-black/40 transition-colors">
                            <Camera className="w-4 h-4 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity" />
                        </div>
                    </>
                ) : (
                    <>
                        <FolderOpen className="w-6 h-6 text-muted-foreground/40 group-hover/thumb:hidden" />
                        <ImagePlus className="w-5 h-5 text-muted-foreground/50 hidden group-hover/thumb:block" />
                    </>
                )}
            </button>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className={cn('text-sm font-medium truncate', isCurrent && 'text-primary')}>
                        {flow.name || t('header.untitledWorkflow')}
                    </span>
                    {isCurrent && (
                        <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full shrink-0">
                            {t('flowList.current')}
                        </span>
                    )}
                </div>

                {/* Description */}
                {isEditingDesc ? (
                    <textarea
                        value={descDraft}
                        onChange={e => setDescDraft(e.target.value)}
                        onBlur={handleDescSave}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleDescSave();
                            }
                            if (e.key === 'Escape') {
                                setDescDraft(flow.description ?? '');
                                setIsEditingDesc(false);
                            }
                        }}
                        onClick={e => e.stopPropagation()}
                        className="mt-1 w-full text-xs text-muted-foreground bg-transparent border border-border rounded px-1.5 py-1 resize-none outline-none focus:border-primary"
                        rows={2}
                        placeholder={t('flowList.addDescription')}
                        autoFocus
                    />
                ) : (
                    <p
                        className="mt-0.5 text-xs text-muted-foreground truncate cursor-text hover:text-foreground/70"
                        onClick={e => {
                            e.stopPropagation();
                            setDescDraft(flow.description ?? '');
                            setIsEditingDesc(true);
                        }}
                        title={flow.description || t('flowList.clickToAddDescription')}
                    >
                        {flow.description || (
                            <span className="italic text-muted-foreground/50">{t('flowList.noDescription')}</span>
                        )}
                    </p>
                )}

                {/* Meta info */}
                <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground/70">
                    <span>{formatRelativeTime(flow.updatedAt, t)}</span>
                    {flow.nodeCount > 0 && (
                        <>
                            <span>·</span>
                            <span>{t('flowList.nodeCount', { count: flow.nodeCount })}</span>
                        </>
                    )}
                </div>
            </div>

            {/* Actions */}
            <div
                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={e => e.stopPropagation()}
            >
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-accent">
                            <MoreVertical className="w-4 h-4 text-muted-foreground" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                            onClick={e => {
                                e.stopPropagation();
                                onRequestThumbnailUpload();
                            }}
                        >
                            {t('flowList.changeThumbnail')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={e => {
                                e.stopPropagation();
                                setDescDraft(flow.description ?? '');
                                setIsEditingDesc(true);
                            }}
                        >
                            {t('flowList.editDescription')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={onDelete}
                            className="text-destructive focus:text-destructive"
                            disabled={isCurrent}
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {t('flowList.delete')}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
};

export const FlowListDialog: React.FC<FlowListDialogProps> = ({
    open,
    onOpenChange,
    currentFlowId,
    onSelectFlow,
    onNewFlow,
}) => {
    const { t } = useTranslation(['flows']);
    const { data, isLoading } = useFlowsListQuery(open);
    const updateFlowMutation = useUpdateFlowMutation();
    const deleteFlowMutation = useDeleteFlowMutation();

    const [search, setSearch] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<FlowItemData | null>(null);

    // Shared file input — lives outside Dialog to avoid focus-stealing issues
    const fileInputRef = useRef<HTMLInputElement>(null);
    const uploadTargetFlowIdRef = useRef<string | null>(null);

    const handleRequestThumbnailUpload = useCallback((flowId: string) => {
        uploadTargetFlowIdRef.current = flowId;
        // Delay to let dropdown menu close before opening file picker
        setTimeout(() => {
            fileInputRef.current?.click();
        }, DROPDOWN_CLOSE_DELAY_MS);
    }, []);

    const handleFileChange = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            const flowId = uploadTargetFlowIdRef.current;
            e.target.value = '';
            uploadTargetFlowIdRef.current = null;

            if (!file || !flowId) return;

            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    const dataUrl = reader.result as string;
                    const processed = await processThumbnail(dataUrl);
                    updateFlowMutation.mutate({ id: flowId, body: { thumbnail: processed } });
                } catch {
                    toast.error(t('publish.thumbnailError'));
                }
            };
            reader.readAsDataURL(file);
        },
        [updateFlowMutation, t]
    );

    const filteredFlows = useMemo((): FlowItemData[] => {
        if (!data?.list) return [];
        const query = search.trim().toLowerCase();
        return [...data.list]
            .filter((f): f is FlowView & { id: string } => !!f.id)
            .map(f => ({
                ...f,
                nodeCount: f.nodeIds$$?.length ?? 0,
            }))
            .filter(
                f =>
                    !query ||
                    (f.name ?? '').toLowerCase().includes(query) ||
                    (f.description ?? '').toLowerCase().includes(query) ||
                    f.id.includes(query)
            )
            .sort((a, b) => {
                const aTime =
                    typeof a.updatedAt === 'string' ? new Date(a.updatedAt).getTime() : Number(a.updatedAt ?? 0);
                const bTime =
                    typeof b.updatedAt === 'string' ? new Date(b.updatedAt).getTime() : Number(b.updatedAt ?? 0);
                return bTime - aTime;
            });
    }, [data?.list, search]);

    const handleSelect = (flowId: string) => {
        if (flowId !== currentFlowId) onSelectFlow(flowId);
        onOpenChange(false);
    };

    const handleNewFlow = () => {
        onNewFlow();
        onOpenChange(false);
    };

    const handleUpdateDescription = (flowId: string, description: string) => {
        updateFlowMutation.mutate({ id: flowId, body: { description } });
    };

    const handleDeleteConfirm = () => {
        if (!deleteTarget) return;
        deleteFlowMutation.mutate(deleteTarget.id);
        setDeleteTarget(null);
    };

    return (
        <>
            {/* File input lives OUTSIDE Dialog to avoid focus-stealing close */}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />

            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden [&>button:last-child]:hidden">
                    <DialogHeader className="px-5 pt-4 pb-3">
                        <div className="flex items-center justify-between">
                            <DialogTitle>{t('flowList.title')}</DialogTitle>
                            <div className="flex items-center gap-0.5">
                                <button
                                    onClick={() => {
                                        setIsSearchOpen(prev => !prev);
                                        if (isSearchOpen) setSearch('');
                                    }}
                                    className={cn(
                                        'flex items-center justify-center w-8 h-8 rounded-lg transition-colors',
                                        isSearchOpen
                                            ? 'text-foreground bg-accent'
                                            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                                    )}
                                >
                                    <Search className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={handleNewFlow}
                                    className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => onOpenChange(false)}
                                    className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </DialogHeader>

                    {/* Search (collapsible) */}
                    {isSearchOpen && (
                        <div className="px-5 pb-3">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    placeholder={t('flowList.searchPlaceholder')}
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="pl-9 h-9"
                                    autoFocus
                                />
                            </div>
                        </div>
                    )}

                    {/* Flow list */}
                    <div className="overflow-y-auto max-h-[60vh] px-5 pb-5">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                                {t('flowList.loading')}
                            </div>
                        ) : filteredFlows.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground">
                                <FolderOpen className="w-10 h-10 mb-2 text-muted-foreground/30" />
                                {search ? t('flowList.noSearchResults') : t('flowList.noResults')}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <div className="text-xs text-muted-foreground mb-1">
                                    {t('flowList.totalFlows', { count: filteredFlows.length })}
                                </div>
                                {filteredFlows.map(flow => (
                                    <FlowCard
                                        key={flow.id}
                                        flow={flow}
                                        isCurrent={flow.id === currentFlowId}
                                        onSelect={() => handleSelect(flow.id)}
                                        onDelete={() => setDeleteTarget(flow)}
                                        onUpdateDescription={desc => handleUpdateDescription(flow.id, desc)}
                                        onRequestThumbnailUpload={() => handleRequestThumbnailUpload(flow.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={!!deleteTarget} onOpenChange={nextOpen => !nextOpen && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('flowList.deleteConfirmTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('flowList.deleteConfirmDescription', {
                                name: deleteTarget?.name || t('header.untitledWorkflow'),
                            })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('flowList.cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {t('flowList.delete')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};
