import axios from 'axios';
import i18n from 'i18next';
import { toast } from 'sonner';

import { API_URL } from '../core';
import { useWebCoreStore } from '../stores/useWebCoreStore';
import { getApiEndpointPath } from '../utils/apiEndpoint';

import type { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

/** Handle auth error: clear credentials, storage, and show toast */
const handleAuthError = (): void => {
    useWebCoreStore.getState().clearApiKey();
    localStorage.removeItem('flows-current-flow-id');
    // Delay toast to show after dialog appears
    setTimeout(() => toast.error(i18n.t('errors.authExpired', { ns: 'common' })), 100);
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
 * Request interceptor: Add x-api-key header and set dynamic baseURL
 */
apiClient.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        const apiKey = useWebCoreStore.getState().apiKey;
        config.baseURL = `${API_URL}${getApiEndpointPath(apiKey)}`;

        if (apiKey) {
            config.headers['x-api-key'] = apiKey;
        }
        return config;
    },
    (error: unknown) => Promise.reject(error)
);

/**
 * Check if response data contains permission error (403 forbidden).
 * Some API Gateway configurations return HTTP 200 with a 403 error in the body.
 */
const hasPermissionError = (data: unknown): boolean => {
    if (!data) return false;
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    return str.toUpperCase().includes('403') && str.toUpperCase().includes('FORBIDDEN');
};

/**
 * Response interceptor: Handle errors globally
 *
 * Auth Error: Only HTTP 403 clears API key (invalid/expired key).
 * Network errors (ERR_NETWORK, 504, 500) should NOT cause logout.
 */
apiClient.interceptors.response.use(
    (response: AxiosResponse) => {
        // Handle 200-wrapped 403 from API Gateway (treat as auth error)
        if (hasPermissionError(response.data)) {
            handleAuthError();
        }
        return response;
    },
    (error: AxiosError) => {
        const status = error.response?.status;

        // Only explicit HTTP 403 triggers logout
        if (status === 403) {
            handleAuthError();
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
