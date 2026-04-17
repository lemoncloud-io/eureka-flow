/** Default namespaces/languages — used as fallback when presign API is unavailable */
export const DEFAULT_NAMESPACES = ['common', 'flows', 'nodes', 'landing', 'tutorial'];
export const DEFAULT_LANGUAGES = ['en', 'ko'];

export const PRESIGN_API_URL = import.meta.env.VITE_I18N_PRESIGN_URL as string | undefined;

/** Fetch available languages and namespaces from the presign API (S3 discovery) */
export const fetchLocales = async (): Promise<{ languages: string[]; namespaces: string[] }> => {
    if (!PRESIGN_API_URL) return { languages: DEFAULT_LANGUAGES, namespaces: DEFAULT_NAMESPACES };
    try {
        const res = await fetch(`${PRESIGN_API_URL}/locales`, { mode: 'cors' });
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
