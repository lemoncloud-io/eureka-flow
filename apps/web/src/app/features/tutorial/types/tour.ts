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
    visual: TourVisual;
    /** Override primary button label (default: '다음', last step: '시작하기') */
    primaryLabel?: string;
    /** Override secondary button label (default: '이전') */
    secondaryLabel?: string;
    /** Whether to show the secondary (back) button */
    showSecondary?: boolean;
}
