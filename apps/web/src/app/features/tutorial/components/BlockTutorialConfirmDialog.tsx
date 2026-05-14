import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import { cn } from '@flows/lib/utils';

interface BlockTutorialConfirmDialogProps {
    onCancel: () => void;
    onConfirm: () => void;
}

/** Confirmation dialog shown when user tries to close block tutorial mid-way */
export const BlockTutorialConfirmDialog: React.FC<BlockTutorialConfirmDialogProps> = ({ onCancel, onConfirm }) => {
    const { t } = useTranslation('tutorial');

    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/46" onClick={onCancel} />

            <div className="relative flex w-[390px] flex-col items-center gap-6 rounded-3xl bg-background px-6 pb-[22px] pt-11 shadow-[0_0_10px_rgba(0,0,0,0.25)]">
                <button onClick={onCancel} className="absolute right-5 top-4 text-muted-foreground">
                    <X size={20} />
                </button>

                <div className="flex flex-col items-center gap-5">
                    <div className="flex flex-col items-center gap-2 text-center">
                        <p className="text-lg font-medium leading-[1.4] tracking-[-0.54px] text-foreground">
                            {t('blockTutorial.confirmDialog.title')}
                        </p>
                        <p className="text-base leading-[1.5] tracking-[-0.48px] text-muted-foreground">
                            {t('blockTutorial.confirmDialog.description')}
                        </p>
                    </div>
                </div>

                <div className="flex w-full gap-2">
                    <button
                        onClick={onCancel}
                        className={cn(
                            'flex h-[46px] flex-1 items-center justify-center rounded-full',
                            'border border-border text-base font-semibold text-muted-foreground'
                        )}
                    >
                        {t('blockTutorial.confirmDialog.cancel')}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={cn(
                            'flex h-[46px] flex-1 items-center justify-center rounded-full',
                            'bg-primary text-base font-semibold text-primary-foreground'
                        )}
                    >
                        {t('blockTutorial.confirmDialog.stop')}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
