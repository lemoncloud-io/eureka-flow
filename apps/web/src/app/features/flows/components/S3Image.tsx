import { memo, useState } from 'react';

import { FileArchive, RefreshCw, X } from 'lucide-react';

import { useS3Image } from '@flows/flows';
import { cn } from '@flows/lib/utils';

interface S3ImageProps {
    src: string;
    alt: string;
    className?: string;
    style?: React.CSSProperties;
    onLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

/**
 * S3-aware image component
 * Automatically resolves S3 URLs (s3://...) to data URLs via proxy
 *
 * @example
 * // S3 URL - will be resolved via API
 * <S3Image src="s3://bucket/key.png" alt="Image" />
 *
 * // Regular URL or data URL - used directly
 * <S3Image src="data:image/png;base64,..." alt="Image" />
 */
// Compares only src/className/style: onLoad is often an inline callback from parent, and since
// src drives all re-fetching, a stale onLoad will never fire on a stale image reference.
export const S3Image = memo<S3ImageProps>(
    ({ src, alt, className, style, onLoad }) => {
        const { src: resolvedSrc, isLoading, error } = useS3Image(src);
        const [imgError, setImgError] = useState(false);

        if (isLoading) {
            return (
                <div className={cn('flex items-center justify-center', className)} style={style}>
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <RefreshCw className="w-4 h-4 text-primary animate-spin" />
                    </div>
                </div>
            );
        }

        if (error || !resolvedSrc) {
            return (
                <div
                    className={cn('bg-muted flex items-center justify-center text-destructive', className)}
                    style={style}
                >
                    <X className="w-4 h-4" />
                </div>
            );
        }

        if (imgError) {
            return (
                <div className={cn('flex items-center justify-center', className)} style={style}>
                    <div className="flex flex-col items-center gap-1.5">
                        <FileArchive className="w-8 h-8 text-muted-foreground/40" />
                        <span className="text-[10px] text-muted-foreground/50">Non-image data</span>
                    </div>
                </div>
            );
        }

        return (
            <img
                src={resolvedSrc}
                alt={alt}
                className={className}
                style={style}
                onLoad={onLoad}
                onError={() => setImgError(true)}
            />
        );
    },
    (prev, next) => prev.src === next.src && prev.className === next.className && prev.style === next.style
);
