import React from 'react';

import { X } from 'lucide-react';

import { cn } from '@flows/lib/utils';

import { EurekaFlowLogo } from './tour-visuals/EurekaFlowLogo';

import type { TourStep } from '../types/tour';

interface TourTooltipProps {
    step: TourStep;
    currentIndex: number;
    totalSteps: number;
    width?: number;
    onNext: () => void;
    onPrev: () => void;
    onClose: () => void;
}

const VisualArea: React.FC<{ visual: TourStep['visual']; width: number }> = ({ visual, width }) => (
    <div
        className="flex items-center justify-center overflow-hidden rounded-t-[22px] bg-[#F4F5F5]"
        style={{ width, height: 184 }}
    >
        {visual.type === 'logo' && <EurekaFlowLogo />}
        {visual.type === 'icon' && (visual.element ?? <div className="h-16 w-16 rounded-xl bg-[#222325]" />)}
        {visual.type === 'confetti' && <span className="text-6xl">🎉</span>}
        {visual.type === 'image' && <img src={visual.src} alt="" className="h-full w-full object-cover" />}
        {visual.type === 'images' && (
            <div className="flex gap-2 px-4">
                {visual.srcs.map(src => (
                    <img key={src} src={src} alt="" className="h-[140px] rounded-lg object-cover" />
                ))}
            </div>
        )}
    </div>
);

export const TourTooltip: React.FC<TourTooltipProps> = ({
    step,
    currentIndex,
    totalSteps,
    width = 360,
    onNext,
    onPrev,
    onClose,
}) => (
    <div className="relative overflow-hidden rounded-[22px] bg-white shadow-[0_0_16px_0_#8F19F6]" style={{ width }}>
        <button
            onClick={onClose}
            aria-label="닫기"
            className={cn(
                'absolute right-3.5 top-3.5 z-10 flex items-center justify-center rounded-full',
                'border border-[#EAEAEC] bg-white p-2.5 shadow-[0_0_6px_rgba(0,0,0,0.14)]'
            )}
        >
            <X size={20} className="text-foreground" />
        </button>

        <VisualArea visual={step.visual} width={width} />

        <div className="flex flex-col gap-5 p-5">
            <div className="flex flex-col gap-2">
                <h3 className="text-base font-semibold leading-6 tracking-[-0.48px] text-[#151619]">{step.title}</h3>
                <p className="whitespace-pre-line text-sm leading-[1.5] tracking-[-0.42px] text-[#32363E]">
                    {step.description}
                </p>
            </div>

            {/* Progress + actions */}
            <div className="flex items-center">
                <span className="flex-1 text-sm font-semibold text-[#151619]">
                    {currentIndex + 1}/<span className="text-[#9FA2A7]">{totalSteps}</span>
                </span>

                <div className="flex gap-3">
                    {step.showSecondary !== false && currentIndex > 0 && (
                        <button
                            onClick={onPrev}
                            className={cn(
                                'rounded-[10px] border border-[#DFE0E2] px-4 py-[9px]',
                                'text-sm font-semibold leading-[22px] text-black'
                            )}
                        >
                            {step.secondaryLabel ?? '이전'}
                        </button>
                    )}
                    <button
                        onClick={onNext}
                        className={cn(
                            'rounded-[10px] bg-[#8F19F6] px-4 py-[9px]',
                            'text-sm font-semibold leading-[22px] text-white'
                        )}
                    >
                        {step.primaryLabel ?? (currentIndex === totalSteps - 1 ? '시작하기' : '다음')}
                    </button>
                </div>
            </div>
        </div>
    </div>
);
