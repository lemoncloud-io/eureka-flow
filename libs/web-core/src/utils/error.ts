export enum ErrorType {
    AUTHENTICATION = 'authentication', // Auth failure (e.g., invalid API key) - requires logout
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

/** Error-like object structure for type-safe error handling */
interface ErrorLike {
    status?: number;
    statusCode?: number;
    response?: { status?: number; data?: { error?: string; message?: string } };
    message?: string;
    code?: string;
    cause?: { code?: string };
    statusText?: string;
}

const PERMISSION_DENIED_MARKER = 'NOT ALLOWED';
const AUTH_ERROR_MARKER = 'FORBIDDEN';

/**
 * Extract a 200-wrapped error envelope as an uppercase string.
 *
 * API Gateway wraps 403 errors as a short string body that starts with the
 * status code (e.g. "403 NOT ALLOWED - ..."). A successful load returns a JSON
 * object, never an envelope — so objects yield '' to avoid scanning legitimate
 * payload content (a flow node prompt containing "forbidden"/"403" must not be
 * mistaken for an auth error).
 */
const toErrorEnvelope = (data: unknown): string => (typeof data === 'string' ? data.toUpperCase() : '');

/** Check if response body indicates a permission-denied error (valid key, no edit rights) */
export const isPermissionDeniedResponse = (data: unknown): boolean =>
    toErrorEnvelope(data).includes(PERMISSION_DENIED_MARKER);

/** Single-pass classification of 200-wrapped 403 errors from API Gateway */
export const classify403Body = (data: unknown): 'permission_denied' | 'auth_error' | null => {
    const body = toErrorEnvelope(data);
    if (!/^\s*403\b/.test(body)) return null;
    if (body.includes(PERMISSION_DENIED_MARKER)) return 'permission_denied';
    if (body.includes(AUTH_ERROR_MARKER)) return 'auth_error';
    return null;
};

export const classifyError = (error: unknown): ErrorClassification => {
    const err = error as ErrorLike;
    const status = err?.status || err?.response?.status || err?.statusCode;
    const message = err?.message || '';

    if (message.includes('INVALID_TOKEN') || message.includes('Token validation failed')) {
        return {
            type: ErrorType.AUTHENTICATION,
            shouldRetry: false,
            shouldLogout: true,
            message: 'Token is invalid',
        };
    }

    // HTTP 403 status → distinguish permission denied vs auth expired
    if (status === 403) {
        if (isPermissionDeniedResponse(err?.response?.data)) {
            return {
                type: ErrorType.CLIENT,
                shouldRetry: false,
                shouldLogout: false,
                message: 'errors.forbidden',
            };
        }
        return {
            type: ErrorType.AUTHENTICATION,
            shouldRetry: false,
            shouldLogout: true,
            message: 'errors.authExpired',
        };
    }

    // Connection refused = server not running, don't retry
    if (isConnectionRefused(err)) {
        return {
            type: ErrorType.CONNECTION_REFUSED,
            shouldRetry: false,
            shouldLogout: false,
            message: 'Server is not available',
        };
    }

    if (isNetworkError(err)) {
        return {
            type: ErrorType.NETWORK,
            shouldRetry: true,
            shouldLogout: false,
            message: 'Please check your network connection',
        };
    }

    if (status && status >= 500 && status < 600) {
        return {
            type: ErrorType.SERVER,
            shouldRetry: true,
            shouldLogout: false,
            message: 'A server error occurred',
        };
    }

    if (status && status >= 400 && status < 500) {
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
const isConnectionRefused = (error: ErrorLike): boolean => {
    const code = error?.code;

    // Browser/Axios error codes
    if (code === 'ERR_CONNECTION_REFUSED' || code === 'ECONNREFUSED') {
        return true;
    }

    // Check cause for wrapped errors
    const causeCode = error?.cause?.code;
    if (causeCode === 'ECONNREFUSED' || causeCode === 'ERR_CONNECTION_REFUSED') {
        return true;
    }

    return false;
};

const isNetworkError = (error: ErrorLike): boolean => {
    const code = error?.code;
    const message = error?.message || '';

    // Axios network errors: transient failures like DNS, connection issues, proxy errors
    if (code === 'ERR_NETWORK' || code === 'ERR_FAILED') {
        return true;
    }

    // Browser-specific disconnection
    if (code === 'ERR_INTERNET_DISCONNECTED') {
        return true;
    }

    // Timeout - worth retrying
    if (code === 'ECONNABORTED' || message.includes('timeout')) {
        return true;
    }

    return false;
};

const DEFAULT_ERROR_MESSAGE = 'An unknown error occurred';

export const extractErrorMessage = (error: unknown): string => {
    if (!error) {
        return DEFAULT_ERROR_MESSAGE;
    }

    if (typeof error === 'string') {
        return error;
    }

    const err = error as ErrorLike & { toString?: () => string };

    if (err.message) {
        return err.message;
    }

    if (err.status || err.statusText) {
        return `${err.status || ''} ${err.statusText || ''}`.trim();
    }

    if (err.toString && err.toString() !== '[object Object]') {
        return err.toString();
    }

    if (err.response?.data) {
        if (err.response.data.error) {
            return err.response.data.error;
        }
        if (err.response.data.message) {
            return err.response.data.message;
        }
    }

    return DEFAULT_ERROR_MESSAGE;
};
