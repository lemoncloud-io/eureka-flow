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
            {/* Backdrop */}
            <div className="absolute inset-0 bg-[rgba(14,14,15,0.46)]" onClick={onCancel} />

            {/* Dialog */}
            <div className="relative flex w-[390px] flex-col items-center gap-6 rounded-3xl bg-white px-6 pb-[22px] pt-11 shadow-[0_0_10px_rgba(0,0,0,0.25)]">
                {/* Close button */}
                <button onClick={onCancel} className="absolute right-5 top-4 text-muted-foreground">
                    <X size={20} />
                </button>

                {/* Content */}
                <div className="flex flex-col items-center gap-5">
                    <div className="flex flex-col items-center gap-2 text-center">
                        <p className="text-lg font-medium leading-[1.4] tracking-[-0.54px] text-black">
                            블록 사용법 확인을 중단하시겠어요?
                        </p>
                        <p className="text-base leading-[1.5] tracking-[-0.48px] text-[#3A3C40]">
                            사용법은 메인 메뉴에서 다시 확인 가능합니다.
                        </p>
                    </div>
                </div>

                {/* Buttons */}
                <div className="flex w-full gap-2">
                    <button
                        onClick={onCancel}
                        className={cn(
                            'flex h-[46px] flex-1 items-center justify-center rounded-full',
                            'border border-[#616161] text-base font-semibold text-[#616161]'
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
