import { initReactI18next } from 'react-i18next';

import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import ChainedBackend from 'i18next-chained-backend';
import HttpBackend from 'i18next-http-backend';
import LocalStorageBackend from 'i18next-localstorage-backend';

const I18N_VERSION = process.env.I18N_VERSION || 'fallback';
const isDevelopment = import.meta.env.DEV;
const namespaces = ['common', 'flows', 'nodes'];

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
            backends: [LocalStorageBackend, HttpBackend],
            backendOptions: [
                {
                    prefix: `i18next_res_${I18N_VERSION}_`,
                    expirationTime: isDevelopment ? 5 * 60 * 1000 : 60 * 60 * 1000,
                    versions: { en: I18N_VERSION, ko: I18N_VERSION },
                },
                {
                    loadPath: `/locales/{{lng}}/{{ns}}.json${isDevelopment ? '' : `?v=${I18N_VERSION}`}`,
                },
            ],
        },
        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage'],
            lookupLocalStorage: 'flows-language',
        },
        react: { useSuspense: true },
    });

export default i18n;
