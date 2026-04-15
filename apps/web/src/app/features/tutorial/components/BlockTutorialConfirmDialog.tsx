import React from 'react';
import { createPortal } from 'react-dom';

import { X } from 'lucide-react';

import { cn } from '@flows/lib/utils';

interface BlockTutorialConfirmDialogProps {
    onCancel: () => void;
    onConfirm: () => void;
}

/** Confirmation dialog shown when user tries to close block tutorial mid-way */
export const BlockTutorialConfirmDialog: React.FC<BlockTutorialConfirmDialogProps> = ({ onCancel, onConfirm }) =>
    createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/46" onClick={onCancel} />

            <div className="relative flex w-[390px] flex-col items-center gap-6 rounded-3xl bg-background px-6 pb-[22px] pt-11 shadow-[0_0_10px_rgba(0,0,0,0.25)]">
                <button onClick={onCancel} className="absolute right-5 top-4 text-muted-foreground">
                    <X size={20} />
                </button>

                <div className="flex flex-col items-center gap-5">
                    <div className="flex flex-col items-center gap-2 text-center">
                        <p className="text-lg font-medium leading-[1.4] tracking-[-0.54px] text-foreground">
                            블록 사용법 확인을 중단하시겠어요?
                        </p>
                        <p className="text-base leading-[1.5] tracking-[-0.48px] text-muted-foreground">
                            사용법은 메인 메뉴에서 다시 확인 가능합니다.
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
                        취소
                    </button>
                    <button
                        onClick={onConfirm}
                        className={cn(
                            'flex h-[46px] flex-1 items-center justify-center rounded-full',
                            'bg-[#8F19F6] text-base font-semibold text-white'
                        )}
                    >
                        중단
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
