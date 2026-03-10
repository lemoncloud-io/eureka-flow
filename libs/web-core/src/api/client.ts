import axios from 'axios';
import i18n from 'i18next';
import { toast } from 'sonner';

import { API_URL } from '../core';
import { useWebCoreStore } from '../stores/useWebCoreStore';
import { classifyError } from '../utils/error';

import type { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

/** Clear flow-related localStorage on auth error */
const clearFlowStorage = (): void => {
    try {
        localStorage.removeItem('flows-current-flow-id');
    } catch {
        // Silently ignore - non-critical operation
    }
};

/**
 * Centralized Axios instance for all API calls
 */
const apiClient: AxiosInstance = axios.create({
    baseURL: API_URL,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    },
});

/**
 * Request interceptor: Add x-api-key header
 */
apiClient.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        const apiKey = useWebCoreStore.getState().apiKey;
        if (apiKey) {
            config.headers['x-api-key'] = apiKey;
        }
        return config;
    },
    (error: unknown) => Promise.reject(error)
);

/** Check if response data contains permission error (403 forbidden) */
const hasPermissionError = (data: unknown): boolean => {
    if (!data) return false;
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    return str.toUpperCase().includes('403') && str.toUpperCase().includes('FORBIDDEN');
};

/**
 * Response interceptor: Handle errors globally
 */
apiClient.interceptors.response.use(
    (response: AxiosResponse) => {
        // Check 200 response for permission error (403 forbidden in body)
        if (hasPermissionError(response.data)) {
            toast.error(i18n.t('errors.forbidden', { ns: 'common' }));
        }
        return response;
    },
    (error: AxiosError) => {
        const status = error.response?.status;
        const classification = classifyError(error);

        // HTTP 403 status → always reset API key
        if (status === 403) {
            useWebCoreStore.getState().clearApiKey();
            clearFlowStorage();
            // Delay toast to show after dialog appears
            setTimeout(() => toast.error(i18n.t('errors.authExpired', { ns: 'common' })), 100);
            return Promise.reject(error);
        }

        // Note: ERR_NETWORK/ERR_FAILED are NOT treated as 403
        // - CORS-blocked 403 cannot be reliably detected (browser security)
        // - Treating network errors as 403 causes false logouts on server downtime

        // Handle other errors that require logout
        if (classification.shouldLogout) {
            useWebCoreStore.getState().clearApiKey();
            clearFlowStorage();
            setTimeout(() => toast.error(i18n.t('errors.authExpired', { ns: 'common' })), 100);
        }

        return Promise.reject(error);
    }
);

/**
 * Type-safe API helper functions
 */
export const api = {
    get: <T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> => apiClient.get<T>(url, config),

    post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> =>
        apiClient.post<T>(url, data, config),

    put: <T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> =>
        apiClient.put<T>(url, data, config),

    patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> =>
        apiClient.patch<T>(url, data, config),

    delete: <T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> =>
        apiClient.delete<T>(url, config),
};

export { apiClient };
