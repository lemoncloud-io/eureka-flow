import React from 'react';

import { cn } from '@flows/lib/utils';

interface TourStepIconProps {
    /** Lucide icon or custom ReactNode */
    icon?: React.ReactNode;
    /** Emoji string — renders as large text */
    emoji?: string;
    label?: string;
    className?: string;
}

/** Centered icon with optional label for tour visual areas */
export const TourStepIcon: React.FC<TourStepIconProps> = ({ icon, emoji, label, className }) => (
    <div className={cn('flex flex-col items-center gap-2', className)}>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-background shadow-sm">
            {emoji ? <span className="text-3xl leading-none">{emoji}</span> : icon}
        </div>
        {label && <span className="text-sm font-medium text-muted-foreground">{label}</span>}
    </div>
);
