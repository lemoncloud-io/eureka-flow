import { useEffect, useState } from 'react';

import { isS3Url, resolveS3Image } from '../utils/s3Utils';

interface UseS3ImageResult {
    src: string | null;
    isLoading: boolean;
    error: Error | null;
}

/**
 * Hook to resolve S3 URLs to data URLs
 *
 * Automatically detects S3 URLs (s3://...) and fetches the image via proxy.
 * Returns the original value for non-S3 URLs (data URLs, http URLs, etc.)
 *
 * @param value - Image value (S3 URL, data URL, or regular URL)
 * @returns { src, isLoading, error }
 */
export const useS3Image = (value: string | undefined | null): UseS3ImageResult => {
    const [src, setSrc] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!value) {
            setSrc(null);
            setIsLoading(false);
            setError(null);
            return;
        }

        // If not an S3 URL, use directly
        if (!isS3Url(value)) {
            setSrc(value);
            setIsLoading(false);
            setError(null);
            return;
        }

        // Resolve S3 URL
        let cancelled = false;
        setIsLoading(true);
        setError(null);

        resolveS3Image(value)
            .then(dataUrl => {
                if (!cancelled) {
                    setSrc(dataUrl);
                    setIsLoading(false);
                }
            })
            .catch(err => {
                if (!cancelled) {
                    setError(err instanceof Error ? err : new Error('Failed to load image'));
                    setSrc(null);
                    setIsLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [value]);

    return { src, isLoading, error };
};
