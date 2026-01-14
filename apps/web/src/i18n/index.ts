import { initReactI18next } from 'react-i18next';

import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import ChainedBackend from 'i18next-chained-backend';
import HttpBackend from 'i18next-http-backend';
import LocalStorageBackend from 'i18next-localstorage-backend';

const namespaces = ['common', 'flows', 'nodes'];

i18n.use(ChainedBackend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        fallbackLng: 'en',
        supportedLngs: ['en', 'ko'],
        defaultNS: 'common',
        ns: namespaces,
        debug: import.meta.env.DEV,
        interpolation: { escapeValue: false },
        backend: {
            backends: [LocalStorageBackend, HttpBackend],
            backendOptions: [
                {
                    prefix: 'flows_i18n_',
                    expirationTime: 7 * 24 * 60 * 60 * 1000,
                    defaultVersion: 'v1',
                },
                {
                    loadPath: '/locales/{{lng}}/{{ns}}.json',
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
