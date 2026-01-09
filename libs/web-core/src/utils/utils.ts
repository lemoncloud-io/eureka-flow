import { classifyError, handleAuthError } from './error';
import { ENV } from '../core';

export const isDev = ENV === 'local' || ENV === 'dev';

/**
 * Async delay helper
 */
export const delay = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Retry operation with exponential backoff
 */
export const withRetry = async <T>(
    operation: () => Promise<T>,
    maxRetries = 4,
    context = 'API call'
): Promise<T> => {
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            const classification = classifyError(error);

            if (classification.shouldLogout) {
                handleAuthError(error, true, `${context} - ${classification.message}`);
            }

            if (!classification.shouldRetry) {
                console.error(`${context} failed:`, classification.message);
                throw error;
            }

            if (attempt === maxRetries) {
                console.error(`${context} failed after ${maxRetries + 1} attempts:`, classification.message);
                throw error;
            }

            const delayMs = Math.pow(2, attempt) * 1000;
            console.warn(
                `${context} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms:`,
                classification.message
            );
            await delay(delayMs);
        }
    }

    throw lastError;
};
