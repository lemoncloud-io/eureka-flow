export enum ErrorType {
    AUTHENTICATION = 'authentication', // 403 - requires logout
    NETWORK = 'network', // Network connection issue - retry
    CONNECTION_REFUSED = 'connection_refused', // Server not running - no retry
    SERVER = 'server', // 5xx - retry
    CLIENT = 'client', // 4xx (except 403) - fail immediately
    UNKNOWN = 'unknown', // Other
}

export interface ErrorClassification {
    type: ErrorType;
    shouldRetry: boolean;
    shouldLogout: boolean;
    message: string;
}

export const MAX_RETRIES = 2;

const DEFAULT_ERROR_MESSAGE = 'An unknown error occurred';

export const classifyError = (error: any): ErrorClassification => {
    const status = error?.status || error?.response?.status || error?.statusCode;
    const message = error?.message || '';

    if (message.includes('INVALID_TOKEN') || message.includes('Token validation failed')) {
        return {
            type: ErrorType.AUTHENTICATION,
            shouldRetry: false,
            shouldLogout: true,
            message: 'Token is invalid',
        };
    }

    if (status === 403) {
        return {
            type: ErrorType.AUTHENTICATION,
            shouldRetry: false,
            shouldLogout: true,
            message: 'Authentication has expired',
        };
    }

    // Connection refused = server not running, don't retry
    if (isConnectionRefused(error)) {
        return {
            type: ErrorType.CONNECTION_REFUSED,
            shouldRetry: false,
            shouldLogout: false,
            message: 'Server is not available',
        };
    }

    if (isNetworkError(error)) {
        return {
            type: ErrorType.NETWORK,
            shouldRetry: true,
            shouldLogout: false,
            message: 'Please check your network connection',
        };
    }

    if (status >= 500 && status < 600) {
        return {
            type: ErrorType.SERVER,
            shouldRetry: true,
            shouldLogout: false,
            message: 'A server error occurred',
        };
    }

    if (status >= 400 && status < 500) {
        return {
            type: ErrorType.CLIENT,
            shouldRetry: false,
            shouldLogout: false,
            message: 'There was a problem with the request',
        };
    }

    return {
        type: ErrorType.UNKNOWN,
        shouldRetry: true,
        shouldLogout: false,
        message: 'An unknown error occurred',
    };
};

/**
 * Check if error is connection refused (server not running)
 * These errors should NOT be retried as the server is simply unavailable
 */
const isConnectionRefused = (error: any): boolean => {
    const code = error?.code;
    const message = error?.message || '';

    // Browser/Axios error codes
    if (code === 'ERR_CONNECTION_REFUSED' || code === 'ECONNREFUSED') {
        return true;
    }
    // Axios wraps connection errors with ERR_NETWORK but the underlying error has details
    if (code === 'ERR_NETWORK' && message.includes('Network Error')) {
        // Check if it's specifically a connection refused
        const cause = error?.cause;
        if (cause?.code === 'ECONNREFUSED' || cause?.code === 'ERR_CONNECTION_REFUSED') {
            return true;
        }
        // In browser, connection refused often shows as generic "Network Error"
        // with no status code (server never responded)
        if (!error?.response && !error?.status) {
            return true;
        }
    }
    return false;
};

const isNetworkError = (error: any): boolean => {
    // Skip if it's connection refused (handled separately)
    if (isConnectionRefused(error)) {
        return false;
    }
    // Axios network error (transient issues like DNS, etc.)
    if (error?.code === 'ERR_INTERNET_DISCONNECTED') {
        return true;
    }
    // Timeout - worth retrying
    if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
        return true;
    }

    return false;
};

export const extractErrorMessage = (error: any): string => {
    if (!error) {
        return DEFAULT_ERROR_MESSAGE;
    }

    if (error.message) {
        return error.message;
    }

    if (error.status || error.statusText) {
        return `${error.status || ''} ${error.statusText || ''}`.trim();
    }

    if (typeof error === 'string') {
        return error;
    }

    if (error.toString && error.toString() !== '[object Object]') {
        return error.toString();
    }

    if (error.response?.data) {
        if (error.response.data.error) {
            return error.response.data.error;
        }
        if (error.response.data.message) {
            return error.response.data.message;
        }
    }

    return DEFAULT_ERROR_MESSAGE;
};

export const handleAuthError = (error: any, shouldLogout: boolean, message?: string): never => {
    console.error(message || 'Authentication error:', error);
    const errorMessage = extractErrorMessage(error);

    if (shouldLogout) {
        alert(`Authentication error: ${errorMessage}`);
        window.location.href = '/auth/logout';
    } else {
        console.error(`Request error: ${errorMessage}`);
    }

    throw error;
};

export class EnvironmentVariableError extends Error {
    constructor(varName: string) {
        super(`Environment variable ${varName} is required but not set or empty`);
        this.name = 'EnvironmentVariableError';
    }
}

export const validateEnvVar = (varName: string, value: string) => {
    if (!value || value.trim() === '') {
        throw new EnvironmentVariableError(varName);
    }
    return value;
};
