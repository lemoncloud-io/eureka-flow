export enum ErrorType {
    AUTHENTICATION = 'authentication', // 403 - requires logout
    NETWORK = 'network', // Network connection issue - retry
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

const isNetworkError = (error: any): boolean => {
    // Axios network error
    if (error?.code === 'ERR_NETWORK' || error?.code === 'ERR_INTERNET_DISCONNECTED') {
        return true;
    }
    // Network connection failure
    if (error?.message?.includes('Network Error') || error?.message?.includes('fetch')) {
        return true;
    }
    // Timeout
    if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
        return true;
    }
    // Connection refused
    if (error?.code === 'ECONNREFUSED') {
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

    console.log('213', shouldLogout);
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
