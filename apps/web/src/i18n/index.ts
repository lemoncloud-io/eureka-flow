import { initReactI18next } from 'react-i18next';

import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import ChainedBackend from 'i18next-chained-backend';
import HttpBackend from 'i18next-http-backend';
import LocalStorageBackend from 'i18next-localstorage-backend';
import resourcesToBackend from 'i18next-resources-to-backend';

const I18N_VERSION = process.env.I18N_VERSION || 'fallback';
const isDevelopment = import.meta.env.DEV;
const namespaces = ['common', 'flows', 'nodes', 'landing', 'tutorial', 'blocks'];
// Single source of truth for languages — add a language here (and its resource files) to enable it.
const SUPPORTED_LANGUAGES = ['en', 'ko'] as const;
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
const loadBundled = (lng: string, ns: string) => import(`../../public/locales/${lng}/${ns}.json`);
const bundledFallback = resourcesToBackend(loadBundled);

const isEmbeddedInIframe = window.parent !== window;

i18n.use(ChainedBackend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        fallbackLng: 'en',
        supportedLngs: [...SUPPORTED_LANGUAGES],
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
                    versions: Object.fromEntries(SUPPORTED_LANGUAGES.map(lng => [lng, I18N_VERSION])),
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
        react: {
            useSuspense: true,
            // When embedded in iframe, subscribe to store events so addResourceBundle triggers re-renders
            ...(isEmbeddedInIframe ? { bindI18nStore: 'added removed' } : {}),
        },
    });

// Supplement S3-loaded translations with bundled resources for keys not yet deployed to S3.
// Uses deep merge without overwrite so S3 keys take priority, but new code-level keys are available.
const supplementWithBundled = async () => {
    const lngs = [...new Set([i18n.language, i18n.options.fallbackLng].flat().filter(Boolean))] as string[];
    for (const lng of lngs) {
        for (const ns of namespaces) {
            try {
                const bundled = (await loadBundled(lng, ns)).default;
                i18n.addResourceBundle(lng, ns, bundled, true, false);
            } catch {
                // bundled resource not available
            }
        }
    }
    i18n.emit('languageChanged', i18n.language);
};

if (i18n.isInitialized) {
    supplementWithBundled();
} else {
    i18n.on('initialized', supplementWithBundled);
}

// Admin i18n editor integration via postMessage (only active when embedded in iframe)
if (isEmbeddedInIframe) {
    console.log('[i18n-preview] iframe mode activated');

    // Cross-origin iframes can't access parent.origin — fallback to '*' for postMessage
    const parentOrigin = (() => {
        try {
            return window.parent.origin;
        } catch {
            return '*';
        }
    })();

    const isTrustedOrigin = (eventOrigin: string) => parentOrigin === '*' || eventOrigin === parentOrigin;

    const postToParent = (message: Record<string, unknown>) => {
        window.parent.postMessage(message, parentOrigin);
    };

    // Helper: update bundle and force re-render via both store event AND languageChanged
    const updateBundle = (lng: string, ns: string, resources: Record<string, unknown>) => {
        i18n.addResourceBundle(lng, ns, resources, true, true);
        // Belt-and-suspenders: emit languageChanged in case bindI18nStore didn't take effect
        i18n.emit('languageChanged', i18n.language);
    };

    window.addEventListener('message', (event: MessageEvent) => {
        const { data } = event;
        if (!data || typeof data.type !== 'string' || !data.type.startsWith('i18n:')) return;
        if (!isTrustedOrigin(event.origin)) return;

        switch (data.type) {
            case 'i18n:update':
                if (data.namespace && data.language && data.resources) {
                    console.log('[i18n-preview] update:', data.language, data.namespace);
                    updateBundle(data.language, data.namespace, data.resources);
                }
                break;
            case 'i18n:changeLanguage':
                if (data.language) {
                    i18n.changeLanguage(data.language);
                }
                break;
            case 'i18n:showKeys':
                if (data.namespace && data.keys) {
                    updateBundle('en', data.namespace, data.keys);
                    updateBundle('ko', data.namespace, data.keys);
                }
                break;
        }
    });

    // Key click detection: when showKeys is active, clicking [key.name] text sends it to admin
    let showKeysActive = false;
    window.addEventListener('message', (event: MessageEvent) => {
        if (!isTrustedOrigin(event.origin)) return;
        if (event.data?.type === 'i18n:showKeys') showKeysActive = true;
        if (event.data?.type === 'i18n:update') showKeysActive = false;
    });

    const KEY_PATTERN = /^\[([a-zA-Z0-9_.]+)\]$/;
    document.addEventListener(
        'click',
        (e: MouseEvent) => {
            if (!showKeysActive) return;
            const el = e.target as HTMLElement;
            const text = el.textContent?.trim();
            if (!text) return;
            const match = text.match(KEY_PATTERN);
            if (match) {
                e.preventDefault();
                e.stopPropagation();
                postToParent({ type: 'i18n:keyClicked', key: match[1] });
            }
        },
        true
    );

    // Notify admin that iframe is ready to receive messages
    const sendReady = () => {
        console.log('[i18n-preview] sending i18n:ready');
        postToParent({ type: 'i18n:ready' });
    };
    if (i18n.isInitialized) {
        sendReady();
    } else {
        i18n.on('initialized', sendReady);
    }
}

export { i18n };
