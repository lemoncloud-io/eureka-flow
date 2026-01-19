import axios from 'axios';

import { API_URL } from '../core';
import { classifyError, handleAuthError } from '../utils/error';

import type { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

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
 * Request interceptor: Add auth headers if needed
 */
apiClient.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        // TODO: Add authentication token when auth is implemented
        // const token = getAuthToken();
        // if (token) {
        //     config.headers.Authorization = `Bearer ${token}`;
        // }
        return config;
    },
    error => Promise.reject(error)
);

/**
 * Response interceptor: Handle errors globally
 */
apiClient.interceptors.response.use(
    (response: AxiosResponse) => response,
    error => {
        const classification = classifyError(error);

        if (classification.shouldLogout) {
            handleAuthError(error, true, classification.message);
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
