import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { ImagePlus, Loader2, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { getPermissions, processThumbnail, useDeleteFlowMutation, useFlows, useUpdateFlowMutation } from '@flows/flows';
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
    Input,
    Label,
    Sheet,
    SheetContent,
    SheetTitle,
    Textarea,
} from '@flows/ui-kit';

import type { FlowRole } from '@flows/flows';

interface MobileFlowSettingsSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    role: FlowRole;
}

export const MobileFlowSettingsSheet = ({ open, onOpenChange, role }: MobileFlowSettingsSheetProps) => {
    const { t } = useTranslation(['flows']);
    const navigate = useNavigate();
    const { currentFlowId, flowName, flowDescription, flowThumbnail } = useFlows();
    const updateFlowMutation = useUpdateFlowMutation();
    const deleteFlowMutation = useDeleteFlowMutation();

    const { canEditStructure } = getPermissions(role);
    const [name, setName] = useState(flowName);
    const [description, setDescription] = useState(flowDescription ?? '');
    const [thumbnail, setThumbnail] = useState<string | null>(flowThumbnail ?? null);
    const [isSaving, setIsSaving] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Snapshot current flow data on open; ignore prop changes mid-edit so socket updates don't
    // overwrite the user's in-progress form values.
    const latestFlowRef = useRef({ flowName, flowDescription, flowThumbnail });
    useEffect(() => {
        latestFlowRef.current = { flowName, flowDescription, flowThumbnail };
    });

    useEffect(() => {
        if (!open) return;
        const snapshot = latestFlowRef.current;
        setName(snapshot.flowName);
        setDescription(snapshot.flowDescription ?? '');
        setThumbnail(snapshot.flowThumbnail ?? null);
    }, [open]);

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            processThumbnail(reader.result as string)
                .then(setThumbnail)
                .catch(() => toast.error(t('publish.thumbnailError', 'Failed to process thumbnail')));
        };
        reader.readAsDataURL(file);
    };

    const handleSave = async () => {
        if (!currentFlowId || isSaving) return;
        setIsSaving(true);
        try {
            await updateFlowMutation.mutateAsync({
                id: currentFlowId,
                body: {
                    name: name.trim() || 'Untitled Flow',
                    description,
                    thumbnail: thumbnail ?? '',
                },
            });
            toast.success(t('flowEditor.saved', 'Saved'));
            onOpenChange(false);
        } catch {
            toast.error(t('flowEditor.failedToSaveWorkflow', 'Failed to save'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!currentFlowId) return;
        try {
            await deleteFlowMutation.mutateAsync(currentFlowId);
            toast.success(t('flowList.deleted', 'Flow deleted'));
            setShowDeleteConfirm(false);
            onOpenChange(false);
            navigate('/');
        } catch {
            toast.error(t('flowList.deleteError', 'Failed to delete flow'));
        }
    };

    return (
        <>
            <Sheet open={open} onOpenChange={onOpenChange}>
                <SheetContent
                    side="bottom"
                    className="max-h-[85vh] rounded-t-2xl px-0 pb-[calc(1.5rem+env(safe-area-inset-bottom))] [&>button:first-child]:hidden"
                >
                    {/* Drag handle */}
                    <div className="flex justify-center pt-2 pb-2">
                        <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
                    </div>

                    <div className="px-4 pb-4 overflow-y-auto">
                        <SheetTitle className="text-base font-semibold mb-4">
                            {t('mobile.flowSettings.title', '플로우 설정')}
                        </SheetTitle>

                        <div className="space-y-5">
                            <div>
                                <Label className="text-sm font-medium mb-1.5 block">
                                    {t('mobile.newFlow.name', '이름')}
                                </Label>
                                <Input
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Untitled Flow"
                                    className="h-10 text-sm"
                                    disabled={!canEditStructure}
                                />
                                <p className="text-[11px] text-muted-foreground/50 mt-1.5">
                                    {t(
                                        'mobile.flowSettings.nameHelper',
                                        '기본 설정된 플로우 이름은 수정이 가능합니다.'
                                    )}
                                </p>
                            </div>

                            <div>
                                <Label className="text-sm font-medium mb-1.5 block">
                                    {t('mobile.newFlow.description', '설명(선택)')}
                                </Label>
                                <Textarea
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder={t(
                                        'mobile.newFlow.descriptionPlaceholder',
                                        '만들고 싶은 AI 워크플로우 설명을 입력하세요.'
                                    )}
                                    rows={3}
                                    className="text-sm resize-none"
                                    disabled={!canEditStructure}
                                />
                            </div>

                            <div>
                                <Label className="text-sm font-medium mb-1.5 block">
                                    {t('mobile.newFlow.image', '플로우 이미지(선택)')}
                                </Label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    id="flow-settings-image"
                                    onChange={handleImageSelect}
                                    disabled={!canEditStructure}
                                />
                                {thumbnail ? (
                                    <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-border/60">
                                        <img src={thumbnail} alt="" className="w-full h-full object-cover" />
                                        {canEditStructure && (
                                            <button
                                                type="button"
                                                onClick={() => setThumbnail(null)}
                                                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
                                            >
                                                <X className="w-3 h-3 text-white" />
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <label
                                        htmlFor="flow-settings-image"
                                        className={cn(
                                            'w-20 h-20 rounded-xl border border-dashed border-border/60',
                                            'flex flex-col items-center justify-center gap-1',
                                            'text-muted-foreground/40 transition-colors',
                                            canEditStructure
                                                ? 'cursor-pointer hover:border-primary/30 hover:text-primary/40'
                                                : 'opacity-50'
                                        )}
                                    >
                                        <ImagePlus className="w-6 h-6" />
                                    </label>
                                )}
                            </div>

                            {canEditStructure && (
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className={cn(
                                        'w-full flex items-center justify-center gap-1.5 py-2',
                                        'text-sm font-medium text-destructive hover:text-destructive/80 transition-colors'
                                    )}
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    {t('mobile.flowSettings.delete', 'Flow Delete')}
                                </button>
                            )}

                            {canEditStructure && (
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className={cn(
                                        'w-full flex items-center justify-center gap-2 h-[51px] rounded-xl',
                                        'text-sm font-semibold transition-all',
                                        'active:scale-[0.98] disabled:opacity-60',
                                        'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                                    )}
                                >
                                    {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                                    <span>{t('mobile.flowSettings.done', '완료')}</span>
                                </button>
                            )}
                        </div>
                    </div>
                </SheetContent>
            </Sheet>

            <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('flowList.deleteConfirmTitle', 'Delete this flow?')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('flowList.deleteConfirmDescription', {
                                name: flowName || t('header.untitledWorkflow', 'Untitled Workflow'),
                            })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('flowList.cancel', 'Cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {t('flowList.delete', 'Delete')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};
