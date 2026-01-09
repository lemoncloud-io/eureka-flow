import { API_URL } from '../core';

/**
 * Base API configuration
 */
export const getApiUrl = () => API_URL;

/**
 * Helper to build API endpoint URLs
 */
export const buildApiUrl = (path: string) => `${API_URL}${path}`;
