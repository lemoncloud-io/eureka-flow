import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ImagePlus, Loader2 } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { Input, Label, Sheet, SheetContent, SheetTitle, Textarea } from '@flows/ui-kit';

interface MobileNewFlowSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreate: () => Promise<string | null>;
    onNameChange: (name: string) => void;
}

export const MobileNewFlowSheet = ({ open, onOpenChange, onCreate, onNameChange }: MobileNewFlowSheetProps) => {
    const { t } = useTranslation(['flows']);
    const [name, setName] = useState('Untitled Flow');
    const [description, setDescription] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Reset state when sheet closes
    useEffect(() => {
        if (!open) {
            setName('Untitled Flow');
            setDescription('');
        }
    }, [open]);

    const handleCreate = async () => {
        if (isCreating) return;
        setIsCreating(true);
        try {
            const newId = await onCreate();
            if (newId) {
                const finalName = name.trim() || 'Untitled Flow';
                onNameChange(finalName);
                onOpenChange(false);
            }
        } finally {
            setIsCreating(false);
        }
    };

    return (
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
                        {t('mobile.newFlow.title', '새 플로우')}
                    </SheetTitle>

                    <div className="space-y-5">
                        {/* Flow name */}
                        <div>
                            <Label className="text-sm font-medium mb-1.5 block">
                                {t('mobile.newFlow.name', '키 이름')}
                            </Label>
                            <Input
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="Untitled Flow"
                                className="h-10 text-sm"
                                autoFocus
                            />
                            <p className="text-[11px] text-muted-foreground/50 mt-1.5">
                                {t('mobile.newFlow.nameHelper', '기본 설정된 플로우 이름은 수정이 가능합니다.')}
                            </p>
                        </div>

                        {/* Description (optional) */}
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
                            />
                        </div>

                        {/* Flow image (optional) */}
                        <div>
                            <Label className="text-sm font-medium mb-1.5 block">
                                {t('mobile.newFlow.image', '플로우 이미지(선택)')}
                            </Label>
                            <button
                                type="button"
                                className={cn(
                                    'w-20 h-20 rounded-xl border border-dashed border-border/60',
                                    'flex flex-col items-center justify-center gap-1',
                                    'text-muted-foreground/40 hover:border-primary/30 hover:text-primary/40',
                                    'transition-colors'
                                )}
                            >
                                <ImagePlus className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Create button */}
                        <button
                            onClick={handleCreate}
                            disabled={isCreating}
                            className={cn(
                                'w-full flex items-center justify-center gap-2 h-[51px] rounded-xl',
                                'text-sm font-semibold transition-all',
                                'active:scale-[0.98] disabled:opacity-60',
                                'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                            )}
                        >
                            {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
                            <span>{t('mobile.newFlow.create', '플로우 만들기')}</span>
                        </button>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
};
