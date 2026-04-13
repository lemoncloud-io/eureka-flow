import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertTriangle, Home, RefreshCw, ServerCrash, ShieldOff, WifiOff } from 'lucide-react';

import { Button } from '@flows/ui-kit';

import { ERROR_MESSAGE_KEYS } from '../consts';

import type { ComponentType, ReactNode } from 'react';
import type { FallbackProps } from 'react-error-boundary';

export type ErrorType = 'network' | 'auth' | 'server' | 'client' | 'unknown';

interface ErrorFallbackProps extends FallbackProps {
    errorType?: ErrorType;
}

const ERROR_ICONS: Record<ErrorType, ReactNode> = {
    network: <WifiOff className="h-10 w-10 text-warning" />,
    auth: <ShieldOff className="h-10 w-10 text-warning" />,
    server: <ServerCrash className="h-10 w-10 text-warning" />,
    client: <AlertTriangle className="h-10 w-10 text-warning" />,
    unknown: <AlertTriangle className="h-10 w-10 text-warning" />,
};

const inferErrorType = (error: Error): ErrorType => {
    const message = error.message.toLowerCase();

    if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
        return 'network';
    }
    if (
        message.includes('401') ||
        message.includes('403') ||
        message.includes('unauthorized') ||
        message.includes('forbidden')
    ) {
        return 'auth';
    }
    if (message.includes('500') || message.includes('502') || message.includes('503')) {
        return 'server';
    }
    if (message.includes('400') || message.includes('404')) {
        return 'client';
    }

    return 'unknown';
};

/**
 * Error boundary fallback component
 * Displays error information with type-specific UI
 */
export const ErrorFallback: ComponentType<ErrorFallbackProps> = ({ error, resetErrorBoundary, errorType }) => {
    const { t } = useTranslation(['common']);
    const errorContainerRef = useRef<HTMLDivElement>(null);
    const [isRetrying, setIsRetrying] = useState(false);

    const resolvedErrorType = errorType ?? inferErrorType(error);
    const messageKeys = ERROR_MESSAGE_KEYS[resolvedErrorType];
    const icon = ERROR_ICONS[resolvedErrorType];

    useEffect(() => {
        errorContainerRef.current?.focus();
    }, []);

    const handleRetry = useCallback(async (): Promise<void> => {
        setIsRetrying(true);
        await new Promise(resolve => setTimeout(resolve, 300));
        setIsRetrying(false);
        resetErrorBoundary();
    }, [resetErrorBoundary]);

    const handleGoHome = useCallback((): void => {
        window.location.href = '/';
    }, []);

    const handleGoToLogin = useCallback((): void => {
        window.location.href = '/auth/login';
    }, []);

    return (
        <div
            ref={errorContainerRef}
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
            tabIndex={-1}
            className="flex min-h-screen items-center justify-center bg-background p-4 outline-none"
        >
            <div className="w-full max-w-md space-y-8 text-center">
                <div className="flex justify-center">{icon}</div>

                <div className="space-y-3">
                    <h2 id="error-title" className="text-2xl font-bold text-foreground">
                        {t(messageKeys.title)}
                    </h2>
                    <p id="error-description" className="leading-relaxed text-muted-foreground">
                        {t(messageKeys.description)}
                    </p>
                </div>

                <div className="rounded-lg border border-border bg-muted p-4">
                    <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words text-sm text-muted-foreground">
                        {error.message}
                    </pre>
                </div>

                <div className="flex justify-center gap-3">
                    <Button
                        variant="outline"
                        onClick={resolvedErrorType === 'auth' ? handleGoToLogin : handleGoHome}
                        aria-label={t('common:accessibility.goToHome')}
                    >
                        <Home className="mr-2 h-4 w-4" />
                        <span>
                            {resolvedErrorType === 'auth' ? t(messageKeys.primaryAction) : t('common:actions.goHome')}
                        </span>
                    </Button>
                    <Button
                        variant="warning"
                        onClick={handleRetry}
                        disabled={isRetrying}
                        aria-label={t('common:accessibility.tryAgain')}
                    >
                        <RefreshCw className={`mr-2 h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
                        <span>{isRetrying ? t('common:actions.retrying') : t(messageKeys.primaryAction)}</span>
                    </Button>
                </div>
            </div>
        </div>
    );
};
