import { PRESIGN_API_URL, presignFetch } from './namespaces';

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

/** Get a pre-signed PUT URL from the presign API */
const getPresignedUrl = async (lng: string, ns: string): Promise<string> => {
    const params = new URLSearchParams({ lng, ns });
    const res = await presignFetch(`/presign?${params}`);
    if (!res.ok) throw new Error(`Failed to get presigned URL: ${res.status}`);
    const { url } = (await res.json()) as { url: string };
    return url;
};

/** Upload translation JSON via pre-signed URL */
export const uploadTranslation = async (lng: string, ns: string, data: Record<string, unknown>): Promise<void> => {
    const url = await getPresignedUrl(lng, ns);
    const response = await fetch(url, {
        method: 'PUT',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data, null, 4),
    });
    if (!response.ok) throw new Error(`Failed to upload: ${response.status}`);
};

export const isUploadConfigured = (): boolean => !!PRESIGN_API_URL;
