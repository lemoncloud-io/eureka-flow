import { initReactI18next } from 'react-i18next';

import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import ChainedBackend from 'i18next-chained-backend';
import HttpBackend from 'i18next-http-backend';
import LocalStorageBackend from 'i18next-localstorage-backend';
import resourcesToBackend from 'i18next-resources-to-backend';

const I18N_VERSION = process.env.I18N_VERSION || 'fallback';
const isDevelopment = import.meta.env.DEV;
const namespaces = ['common', 'flows', 'nodes', 'landing', 'tutorial'];
const S3_BUCKET_URL = import.meta.env.VITE_I18N_BUCKET_URL;

// Clean up old i18n caches (production only)
if (!isDevelopment) {
    const currentPrefix = `i18next_res_${I18N_VERSION}_`;
    Object.keys(localStorage).forEach(key => {
        // Clean legacy prefix (one-time migration)
        if (key.startsWith('flows_i18n_')) {
            localStorage.removeItem(key);
        }
        // Clean outdated versioned caches
        if (key.startsWith('i18next_res_') && !key.startsWith(currentPrefix)) {
            localStorage.removeItem(key);
        }
    });
}

// HTTP load path: S3 bucket URL if configured, otherwise local /locales/
const httpLoadPath = S3_BUCKET_URL
    ? `${S3_BUCKET_URL}/{{lng}}/{{ns}}.json${isDevelopment ? '' : `?v=${I18N_VERSION}`}`
    : `/locales/{{lng}}/{{ns}}.json${isDevelopment ? '' : `?v=${I18N_VERSION}`}`;

// Bundled fallback: dynamic import from public/locales (safety net when S3 is unreachable)
const bundledFallback = resourcesToBackend(
    (lng: string, ns: string) => import(`../../public/locales/${lng}/${ns}.json`)
);

i18n.use(ChainedBackend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        fallbackLng: 'en',
        supportedLngs: ['en', 'ko'],
        defaultNS: 'common',
        ns: namespaces,
        debug: isDevelopment,
        interpolation: { escapeValue: false },
        backend: {
            // [0] localStorage cache (fast) → [1] S3/HTTP (authoritative) → [2] bundled fallback (offline)
            backends: [LocalStorageBackend, HttpBackend, bundledFallback],
            backendOptions: [
                {
                    prefix: `i18next_res_${I18N_VERSION}_`,
                    expirationTime: isDevelopment ? 5 * 60 * 1000 : 60 * 60 * 1000,
                    versions: { en: I18N_VERSION, ko: I18N_VERSION },
                },
                {
                    loadPath: httpLoadPath,
                    requestOptions: S3_BUCKET_URL ? { mode: 'cors' as RequestMode } : undefined,
                },
            ],
            // When localStorage hits, also refresh from S3 in background
            ...(S3_BUCKET_URL ? { cacheHitMode: 'refresh' } : {}),
        },
        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage'],
            lookupLocalStorage: 'flows-language',
        },
        react: { useSuspense: true },
    });

// Listen for postMessage from admin i18n editor
// Protocol:
//   { type: 'i18n:update', namespace, language, resources }  → inject translations
//   { type: 'i18n:changeLanguage', language }                → switch language
//   { type: 'i18n:showKeys', namespace, keys }               → replace values with keys
window.addEventListener('message', (event: MessageEvent) => {
    const { data } = event;
    if (!data || typeof data.type !== 'string' || !data.type.startsWith('i18n:')) return;

    switch (data.type) {
        case 'i18n:update':
            // Merge edited translations into running i18next instance
            if (data.namespace && data.language && data.resources) {
                i18n.addResourceBundle(data.language, data.namespace, data.resources, true, true);
            }
            break;
        case 'i18n:changeLanguage':
            if (data.language) {
                i18n.changeLanguage(data.language);
            }
            break;
        case 'i18n:showKeys':
            // Replace all values with their dot-notation keys for debugging
            if (data.namespace && data.keys) {
                i18n.addResourceBundle('en', data.namespace, data.keys, true, true);
                i18n.addResourceBundle('ko', data.namespace, data.keys, true, true);
            }
            break;
    }
});

export { i18n };
