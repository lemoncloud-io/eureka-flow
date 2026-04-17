const S3_BUCKET_URL = import.meta.env.VITE_I18N_BUCKET_URL as string | undefined;
const WEB_APP_URL = import.meta.env.VITE_WEB_APP_URL as string | undefined;

/** S3 mode: direct bucket access. Local mode: fetch from web dev server's /locales/ */
const getTranslationUrl = (lng: string, ns: string): string => {
    if (S3_BUCKET_URL) return `${S3_BUCKET_URL}/${lng}/${ns}.json`;
    const webUrl = WEB_APP_URL || 'http://localhost:3000';
    return `${webUrl}/locales/${lng}/${ns}.json`;
};

/** Fetch translation JSON (from S3 or web app's local files) */
export const fetchTranslation = async (lng: string, ns: string): Promise<Record<string, unknown>> => {
    const url = getTranslationUrl(lng, ns);
    const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache',
    });
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
    return response.json();
};

/** Upload translation JSON to S3 (only available when S3 is configured) */
export const uploadTranslation = async (lng: string, ns: string, data: Record<string, unknown>): Promise<void> => {
    if (!S3_BUCKET_URL) throw new Error('Upload requires VITE_I18N_BUCKET_URL to be configured');
    const url = getTranslationUrl(lng, ns);
    const response = await fetch(url, {
        method: 'PUT',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data, null, 4),
    });
    if (!response.ok) throw new Error(`Failed to upload ${url}: ${response.status}`);
};

export const isS3Configured = (): boolean => !!S3_BUCKET_URL;
