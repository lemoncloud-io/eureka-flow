import { useCallback, useEffect, useRef } from 'react';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';

import { AlertTriangle, Home, RefreshCw, ServerCrash } from 'lucide-react';

import { Button } from '@flows/ui-kit';

import { ERROR_MESSAGES } from '../consts';
import { NotFoundPage } from './NotFoundPage';

import type { ReactNode } from 'react';

interface RouterErrorFallbackProps {
    onError?: (error: Error, errorInfo: { componentStack?: string }) => void;
}

type RouterErrorType = 'notFound' | 'server' | 'unknown';

const ERROR_ICONS: Record<RouterErrorType, ReactNode> = {
    notFound: <AlertTriangle className="h-10 w-10 text-orange-500" />,
    server: <ServerCrash className="h-10 w-10 text-orange-500" />,
    unknown: <AlertTriangle className="h-10 w-10 text-orange-500" />,
};

const inferRouterErrorType = (error: unknown): RouterErrorType => {
    if (isRouteErrorResponse(error)) {
        if (error.status === 404) return 'notFound';
        if (error.status >= 500) return 'server';
    }
    return 'unknown';
};

const getErrorMessage = (error: unknown): string => {
    if (isRouteErrorResponse(error)) {
        return `${error.status} ${error.statusText}`;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return '알 수 없는 오류가 발생했습니다';
};

export const RouterErrorFallback = ({ onError }: RouterErrorFallbackProps): JSX.Element => {
    const error = useRouteError();
    const navigate = useNavigate();
    const containerRef = useRef<HTMLDivElement>(null);

    const errorType = inferRouterErrorType(error);
    const errorMessage = getErrorMessage(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    useEffect(() => {
        if (onError && errorType !== 'notFound') {
            const errorObj = error instanceof Error ? error : new Error(errorMessage);
            onError(errorObj, { componentStack: errorStack });
        }
    }, [error, errorMessage, errorStack, errorType, onError]);

    useEffect(() => {
        if (errorType !== 'notFound') {
            containerRef.current?.focus();
        }
    }, [errorType]);

    const handleRetry = useCallback((): void => {
        window.location.reload();
    }, []);

    const handleGoHome = useCallback((): void => {
        navigate('/');
    }, [navigate]);

    // 404 renders dedicated page
    if (errorType === 'notFound') {
        return <NotFoundPage />;
    }

    const messages = errorType === 'server' ? ERROR_MESSAGES.server : ERROR_MESSAGES.unknown;
    const icon = ERROR_ICONS[errorType];

    return (
        <div
            ref={containerRef}
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
                        {messages.title}
                    </h2>
                    <p id="error-description" className="leading-relaxed text-muted-foreground">
                        {messages.description}
                    </p>
                </div>

                <div className="rounded-lg border border-border bg-muted p-4">
                    <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-sm text-muted-foreground">
                        {errorMessage}
                    </pre>
                </div>

                <div className="flex justify-center gap-3">
                    <Button variant="outline" onClick={handleGoHome} aria-label="홈으로 이동">
                        <Home className="mr-2 h-4 w-4" />
                        <span>{messages.secondaryAction}</span>
                    </Button>
                    <Button
                        onClick={handleRetry}
                        className="bg-orange-500 text-white hover:bg-orange-600"
                        aria-label="다시 시도"
                    >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        <span>{messages.primaryAction}</span>
                    </Button>
                </div>
            </div>
        </div>
    );
};
