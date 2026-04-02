import React from 'react';

import { cn } from '@flows/lib/utils';

// ============================================================================
// Icon Type Detection
// ============================================================================

const isUrl = (value: string): boolean => /^https?:\/\//.test(value);

const isSvg = (value: string): boolean => value.trimStart().startsWith('<svg');

// ============================================================================
// BlockIcon Component
// ============================================================================

interface BlockIconProps {
    /** Icon value from server: emoji, URL, SVG string, or short text */
    icon?: string;
    /** Fallback element when icon is empty/undefined */
    fallback?: React.ReactNode;
    /** Additional CSS classes */
    className?: string;
    /** Icon size in pixels (default: 16) */
    size?: number;
}

/**
 * Renders a block icon from server data.
 * Auto-detects icon type: URL → img, SVG → inline SVG, else → text/emoji.
 * Falls back to provided fallback element when no icon data.
 */
export const BlockIcon: React.FC<BlockIconProps> = ({ icon, fallback, className, size = 16 }) => {
    if (!icon) {
        return fallback ?? null;
    }

    const style = { width: size, height: size };

    if (isUrl(icon)) {
        return <img src={icon} alt="" style={style} className={cn('object-contain', className)} loading="lazy" />;
    }

    if (isSvg(icon)) {
        return (
            <span
                style={style}
                className={cn('inline-flex items-center justify-center [&>svg]:w-full [&>svg]:h-full', className)}
                dangerouslySetInnerHTML={{ __html: icon }}
            />
        );
    }

    // Emoji or short text
    return (
        <span
            style={{ fontSize: size }}
            className={cn('leading-none inline-flex items-center justify-center', className)}
        >
            {icon}
        </span>
    );
};
