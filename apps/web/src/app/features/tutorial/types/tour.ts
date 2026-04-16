import type { ReactNode } from 'react';

export type ArrowDirection = 'top' | 'bottom' | 'left' | 'right' | 'none';

export type TourVisual =
    | { type: 'logo' }
    | { type: 'confetti' }
    | { type: 'icon'; element: ReactNode }
    | { type: 'image'; src: string }
    | { type: 'images'; srcs: string[] };

export interface TourStep {
    id: string;
    title: string;
    description: string;
    /** CSS selector for the element to highlight. If omitted, tooltip appears centered. */
    targetSelector?: string;
    /** Direction the arrow points toward the highlighted element */
    arrowDirection: ArrowDirection;
    /** Visual content shown in the top area of the tooltip */
    visual?: TourVisual;
    /** Override primary button label (default: '다음', last step: '시작하기') */
    primaryLabel?: string;
    /** Override secondary button label (default: '이전') */
    secondaryLabel?: string;
    /** Whether to show the secondary (back) button */
    showSecondary?: boolean;
}

/** Step action type for interactive tutorial */
export type InteractiveAction =
    | 'start' // Intro modal — user clicks "연습하기"
    | 'auto' // Auto-advance after delay
    | 'confirm' // User clicks confirm button in tooltip
    | 'complete'; // Completion modal

export interface InteractiveTourStep {
    id: string;
    title: string;
    description: string;
    targetSelector?: string;
    arrowDirection: ArrowDirection;
    visual?: TourVisual;
    action: InteractiveAction;
    primaryLabel?: string;
    secondaryLabel?: string;
    showSecondary?: boolean;
    /** Auto-advance delay in ms (for 'auto' action) */
    autoAdvanceMs?: number;
    /** Override tooltip width */
    tooltipWidth?: number;
}
