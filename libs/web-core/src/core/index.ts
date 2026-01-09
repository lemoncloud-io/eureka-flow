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
export const API_URL = window.VITE_API_URL || import.meta.env?.VITE_API_URL || 'http://localhost:8000';

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
