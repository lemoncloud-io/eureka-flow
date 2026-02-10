import { RefreshCw, X } from 'lucide-react';

import { useS3Image } from '@flows/flows';
import { cn } from '@flows/lib/utils';

interface S3ImageProps {
    src: string;
    alt: string;
    className?: string;
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
export const S3Image: React.FC<S3ImageProps> = ({ src, alt, className, onLoad }) => {
    const { src: resolvedSrc, isLoading, error } = useS3Image(src);

    if (isLoading) {
        return (
            <div className={cn('flex items-center justify-center', className)}>
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <RefreshCw className="w-4 h-4 text-primary animate-spin" />
                </div>
            </div>
        );
    }

    if (error || !resolvedSrc) {
        return (
            <div className={cn('bg-muted flex items-center justify-center text-destructive', className)}>
                <X className="w-4 h-4" />
            </div>
        );
    }

    return <img src={resolvedSrc} alt={alt} className={className} onLoad={onLoad} />;
};
