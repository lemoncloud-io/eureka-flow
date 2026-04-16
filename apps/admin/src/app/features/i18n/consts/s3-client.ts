const S3_BUCKET_URL = import.meta.env.VITE_I18N_BUCKET_URL as string | undefined;

const getS3Url = (lng: string, ns: string): string => {
    if (!S3_BUCKET_URL) throw new Error('VITE_I18N_BUCKET_URL is not configured');
    return `${S3_BUCKET_URL}/${lng}/${ns}.json`;
};

/** Fetch translation JSON from S3 */
export const fetchTranslation = async (lng: string, ns: string): Promise<Record<string, unknown>> => {
    const url = getS3Url(lng, ns);
    const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache',
    });
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
    return response.json();
};

/** Upload translation JSON to S3 */
export const uploadTranslation = async (lng: string, ns: string, data: Record<string, unknown>): Promise<void> => {
    const url = getS3Url(lng, ns);
    const response = await fetch(url, {
        method: 'PUT',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data, null, 4),
    });
    if (!response.ok) throw new Error(`Failed to upload ${url}: ${response.status}`);
};

export const isS3Configured = (): boolean => !!S3_BUCKET_URL;
