import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Loader2 } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { Input, Label, Sheet, SheetContent, SheetTitle } from '@flows/ui-kit';

interface MobileNewFlowSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreate: () => Promise<string | null>;
    onNameChange: (name: string) => void;
}

export const MobileNewFlowSheet = ({ open, onOpenChange, onCreate, onNameChange }: MobileNewFlowSheetProps) => {
    const { t } = useTranslation(['flows']);
    const [name, setName] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Reset state when sheet closes
    useEffect(() => {
        if (!open) setName('');
    }, [open]);

    const handleCreate = async () => {
        if (isCreating) return;
        setIsCreating(true);
        try {
            const newId = await onCreate();
            if (newId) {
                if (name.trim()) onNameChange(name.trim());
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

                <div className="px-4 pb-4">
                    <SheetTitle className="text-base font-semibold mb-4">
                        {t('mobile.newFlow.title', '새 플로우 만들기')}
                    </SheetTitle>

                    <div className="space-y-4">
                        {/* Flow name */}
                        <div>
                            <Label className="text-sm font-medium mb-1.5 block">
                                {t('mobile.newFlow.name', '플로우 이름')}
                            </Label>
                            <Input
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder={t('mobile.newFlow.namePlaceholder', '플로우 이름을 입력하세요')}
                                className="h-10 text-sm"
                                autoFocus
                            />
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
