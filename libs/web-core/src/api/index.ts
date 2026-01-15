import { API_URL, ENV } from '../core';

/**
 * Base API configuration
 */
export const getApiUrl = () => API_URL;

/**
 * Helper to build API endpoint URLs
 */
export const buildApiUrl = (path: string) => `${API_URL}${path}`;

// ============================================================================
// Error Report Types & API
// ============================================================================

export type AppType = 'web' | 'admin' | 'landing';

export interface ErrorReportPayload {
    message: string;
    stack?: string;
    componentStack?: string;
    app: AppType;
    env: string;
    url: string;
    timestamp: string;
    userId?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
}

/**
 * Report error to backend for logging/monitoring
 * Uses backend /hello/report endpoint if available
 */
export const reportError = async (
    error: Error,
    errorInfo: { componentStack?: string },
    app: AppType,
    userId?: string
): Promise<void> => {
    if (ENV?.toUpperCase() === 'LOCAL') {
        console.warn('[ErrorReport] Skipped in local environment:', error.message);
        return;
    }

    try {
        const payload: ErrorReportPayload = {
            message: error.message,
            stack: error.stack,
            componentStack: errorInfo.componentStack,
            app,
            env: ENV,
            url: window.location.href,
            timestamp: new Date().toISOString(),
            userId,
            userAgent: navigator.userAgent,
        };

        // In production, send to backend if endpoint is configured
        const backendEndpoint = import.meta.env.VITE_BACKEND_API_ENDPOINT;
        if (!backendEndpoint) {
            console.warn('[ErrorReport] VITE_BACKEND_API_ENDPOINT not configured, skipping remote report');
            return;
        }

        await fetch(`${backendEndpoint}/hello/report`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title: `[${app.toUpperCase()}] ${error.name || 'Error'}`,
                message: JSON.stringify(payload, null, 2),
            }),
        });
    } catch (reportingError) {
        console.error('Failed to report error:', reportingError);
    }
};
