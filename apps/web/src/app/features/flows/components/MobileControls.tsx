import { Maximize, Minus, Plus, RotateCcw } from 'lucide-react';

import { cn } from '@flows/lib/utils';

import type { LucideIcon } from 'lucide-react';

interface MobileControlsProps {
    onZoomIn: () => void;
    onZoomOut: () => void;
    onFitToScreen: () => void;
    onReset: () => void;
    className?: string;
}

interface ControlButton {
    label: string;
    icon: LucideIcon;
    onClick: () => void;
}

const buttonClasses = cn(
    // Size: 44x44px for touch target (Apple HIG)
    'w-11 h-11',
    // Appearance
    'rounded-full',
    'bg-glass-bg backdrop-blur-2xl',
    'border border-border/40',
    'shadow-floating',
    // Content
    'flex items-center justify-center',
    'text-foreground',
    // Interaction
    'active:scale-95 active:bg-accent/50',
    'transition-transform duration-100'
);

/**
 * Mobile-friendly floating zoom controls.
 * Displayed only on mobile devices (hidden on sm: and above).
 * Uses 44x44px touch targets per Apple HIG guidelines.
 */
export const MobileControls = ({ onZoomIn, onZoomOut, onFitToScreen, onReset, className }: MobileControlsProps) => {
    const controls: ControlButton[] = [
        { label: 'Zoom in', icon: Plus, onClick: onZoomIn },
        { label: 'Zoom out', icon: Minus, onClick: onZoomOut },
        { label: 'Fit to screen', icon: Maximize, onClick: onFitToScreen },
        { label: 'Reset view', icon: RotateCcw, onClick: onReset },
    ];

    return (
        <div
            className={cn(
                // Layout
                'flex flex-col gap-2',
                // Position: bottom-right, above sidebar (z-30)
                'fixed bottom-24 right-4 z-30',
                // Visibility: mobile only
                'sm:hidden',
                className
            )}
        >
            {controls.map(({ label, icon: Icon, onClick }) => (
                <button key={label} onClick={onClick} className={buttonClasses} aria-label={label}>
                    <Icon className="w-5 h-5" />
                </button>
            ))}
        </div>
    );
};
