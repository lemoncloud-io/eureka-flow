import axios from 'axios';
import i18n from 'i18next';
import { toast } from 'sonner';

import { API_URL } from '../core';
import { useWebCoreStore } from '../stores/useWebCoreStore';
import { getApiEndpointPath } from '../utils/apiEndpoint';
import { classify403Body, isPermissionDeniedResponse } from '../utils/error';

import type { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

declare module 'axios' {
    interface AxiosRequestConfig {
        /** Skip auth error handling (clearApiKey) for this request */
        _skipAuthError?: boolean;
    }
}

/** Handle auth error: clear credentials, storage, and show toast */
const handleAuthError = (): void => {
    const store = useWebCoreStore.getState();
    const invalidKey = store.apiKey;
    store.clearApiKey();
    if (invalidKey) store.markKeyInvalid(invalidKey);
    localStorage.removeItem('flows-current-flow-id');
    // Delay toast to show after dialog appears
    setTimeout(() => toast.error(i18n.t('errors.authExpired', { ns: 'common' })), 100);
};

/** Handle permission denied: show toast without clearing credentials */
const handlePermissionDenied = (): void => {
    toast.error(i18n.t('errors.forbidden', { ns: 'common' }));
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

/** Check if request is using the public endpoint (no API key) */
const isPublicRequest = (config?: InternalAxiosRequestConfig): boolean => config?.baseURL?.includes('/public') ?? false;

/** Check if auth error handling should be skipped for this request */
const shouldSkipAuthError = (config?: InternalAxiosRequestConfig): boolean =>
    isPublicRequest(config) || !!config?._skipAuthError;

/**
 * Response interceptor: Handle errors globally
 *
 * Auth Error: Only HTTP 403 clears API key (invalid/expired key).
 * Network errors (ERR_NETWORK, 504, 500) should NOT cause logout.
 * Public requests (no API key) never trigger auth error handling.
 */
apiClient.interceptors.response.use(
    (response: AxiosResponse) => {
        // Skip auth error handling for public or explicitly opted-out requests
        if (shouldSkipAuthError(response.config)) return response;

        // Handle 200-wrapped 403 from API Gateway (single-pass detection)
        const bodyResult = classify403Body(response.data);
        if (bodyResult === 'permission_denied') {
            handlePermissionDenied();
        } else if (bodyResult === 'auth_error') {
            handleAuthError();
        }
        return response;
    },
    (error: AxiosError) => {
        // Skip auth error handling for public or explicitly opted-out requests
        if (shouldSkipAuthError(error.config)) return Promise.reject(error);

        const status = error.response?.status;

        if (status === 401) {
            // expired/revoked key — clear credentials
            handleAuthError();
        } else if (status === 403) {
            // distinguish permission denied (valid key) vs auth expired
            if (isPermissionDeniedResponse(error.response?.data)) {
                handlePermissionDenied();
            } else {
                handleAuthError();
            }
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
