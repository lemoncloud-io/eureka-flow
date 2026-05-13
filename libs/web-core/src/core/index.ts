import { WebCoreFactory } from '@lemoncloud/lemon-web-core';

import { EnhancedStorage } from './EnhancedStorage';

declare global {
    interface Window {
        ENV?: string;
        VITE_API_URL?: string;
    }
}

/**
 * Environment configuration variables
 */
export const ENV = (window.ENV || import.meta.env?.VITE_ENV || 'local').toLowerCase();
export const PROJECT = (import.meta.env?.VITE_PROJECT || 'flows').toLowerCase();
export const API_URL = window.VITE_API_URL || import.meta.env?.VITE_API_URL || 'http://localhost:8000';
export const REGION = (import.meta.env?.VITE_REGION || 'ap-northeast-2').toLowerCase();

// OAuth endpoints (optional — when set, enables OAuth login)
export const OAUTH_ENDPOINT = import.meta.env?.VITE_OAUTH_ENDPOINT?.toLowerCase() || '';
export const SOCIAL_OAUTH_ENDPOINT = import.meta.env?.VITE_SOCIAL_OAUTH_ENDPOINT?.toLowerCase() || '';
export const OPENAPI_ENDPOINT = import.meta.env?.VITE_OPENAPI_ENDPOINT?.toLowerCase() || '';
export const HOST = import.meta.env?.VITE_HOST?.toLowerCase() || window.location.origin;

/** Whether OAuth login is enabled (all required env vars present) */
export const isOAuthEnabled = !!OAUTH_ENDPOINT && !!SOCIAL_OAUTH_ENDPOINT;

/**
 * Key for storing language preference
 */
export const LANGUAGE_KEY = 'i18nextLng';

/**
 * Get stored language or default to 'ko'
 */
export const getLanguage = (): string => {
    return localStorage.getItem(LANGUAGE_KEY) || 'ko';
};

/**
 * Set language preference
 */
export const setLanguage = (lang: string): void => {
    localStorage.setItem(LANGUAGE_KEY, lang);
};

// WebCore instance — only created when OAuth is enabled
type WebCoreInstance = ReturnType<typeof WebCoreFactory.create>;
let _webCore: WebCoreInstance | null = null;

const createWebCore = (): WebCoreInstance | null => {
    if (!isOAuthEnabled) return null;

    const enhancedStorage = new EnhancedStorage();
    return WebCoreFactory.create({
        cloud: 'aws',
        project: `${PROJECT}_${ENV}`,
        oAuthEndpoint: OAUTH_ENDPOINT,
        region: REGION,
        storage: enhancedStorage as Storage,
    });
};

/** Get the webCore instance or null if OAuth is not enabled. */
export const getWebCoreOrNull = (): WebCoreInstance | null => {
    if (!_webCore) _webCore = createWebCore();
    return _webCore;
};

/** Get the webCore instance. Throws if OAuth is not enabled. */
export const getWebCore = (): WebCoreInstance => {
    const instance = getWebCoreOrNull();
    if (!instance) throw new Error('WebCore is not available. Set VITE_OAUTH_ENDPOINT to enable OAuth.');
    return instance;
};

export { EnhancedStorage } from './EnhancedStorage';
