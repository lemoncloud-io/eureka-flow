const WEB_APP_URL = import.meta.env.VITE_WEB_APP_URL as string | undefined;

/** Fetch current translation JSON from the web app's bundled /locales/ files */
export const fetchTranslation = async (lng: string, ns: string): Promise<Record<string, unknown>> => {
    const webUrl = WEB_APP_URL || 'http://localhost:3000';
    const url = `${webUrl}/locales/${lng}/${ns}.json`;
    const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache',
    });
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
    return response.json();
};

/** Download translation JSON as `{ns}.{lng}.json` — copy into apps/web/public/locales/{lng}/{ns}.json */
export const downloadTranslationFile = (lng: string, ns: string, data: Record<string, unknown>): void => {
    const blob = new Blob([`${JSON.stringify(data, null, 4)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${ns}.${lng}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
};

/** Parse an import file name of the form `{ns}.{lng}.json` (or `{lng}.json`) */
export const parseTranslationFileName = (
    fileName: string,
    languages: string[]
): { lng: string; ns: string | null } | null => {
    const parts = fileName.replace(/\.json$/i, '').split('.');
    const lng = parts[parts.length - 1];
    if (!languages.includes(lng)) return null;
    return { lng, ns: parts.length > 1 ? parts.slice(0, -1).join('.') : null };
};
