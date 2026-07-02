/** Default namespaces/languages — used as fallback when presign API is unavailable */
export const DEFAULT_NAMESPACES = ['common', 'flows', 'nodes', 'landing', 'tutorial', 'blocks'];
export const DEFAULT_LANGUAGES = ['en', 'ko'];

export const PRESIGN_API_URL = import.meta.env.VITE_I18N_PRESIGN_URL as string | undefined;
const PRESIGN_API_KEY = import.meta.env.VITE_I18N_PRESIGN_API_KEY as string | undefined;

/** Fetch from presign API with optional API key auth */
export const presignFetch = (path: string): Promise<Response> => {
    if (!PRESIGN_API_URL) throw new Error('VITE_I18N_PRESIGN_URL is not configured');
    const headers: Record<string, string> = {};
    if (PRESIGN_API_KEY) headers['x-i18n-key'] = PRESIGN_API_KEY;
    return fetch(`${PRESIGN_API_URL}${path}`, { mode: 'cors', headers });
};

/** Fetch available languages and namespaces from the presign API (S3 discovery) */
export const fetchLocales = async (): Promise<{ languages: string[]; namespaces: string[] }> => {
    if (!PRESIGN_API_URL) return { languages: DEFAULT_LANGUAGES, namespaces: DEFAULT_NAMESPACES };
    try {
        const res = await presignFetch('/locales');
        if (!res.ok) throw new Error(`${res.status}`);
        const data = (await res.json()) as { languages: string[]; namespaces: string[] };
        return {
            languages: data.languages.length > 0 ? data.languages : DEFAULT_LANGUAGES,
            namespaces: data.namespaces.length > 0 ? data.namespaces : DEFAULT_NAMESPACES,
        };
    } catch {
        return { languages: DEFAULT_LANGUAGES, namespaces: DEFAULT_NAMESPACES };
    }
};
