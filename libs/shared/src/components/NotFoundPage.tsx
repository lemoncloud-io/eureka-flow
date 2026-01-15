import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { ArrowLeft, Home } from 'lucide-react';

import { Button } from '@flows/ui-kit';

import { ERROR_MESSAGE_KEYS } from '../consts';

export const NotFoundPage = (): JSX.Element => {
    const { t } = useTranslation(['common']);
    const navigate = useNavigate();
    const containerRef = useRef<HTMLDivElement>(null);

    const messageKeys = ERROR_MESSAGE_KEYS.notFound;

    useEffect(() => {
        containerRef.current?.focus();
    }, []);

    const handleGoHome = useCallback((): void => {
        navigate('/');
    }, [navigate]);

    const handleGoBack = useCallback((): void => {
        navigate(-1);
    }, [navigate]);

    return (
        <div
            ref={containerRef}
            role="main"
            aria-labelledby="notfound-title"
            tabIndex={-1}
            className="flex min-h-screen items-center justify-center bg-background p-4 outline-none"
        >
            <div className="w-full max-w-md space-y-8 text-center">
                <h1 className="text-8xl font-bold text-orange-500">404</h1>

                <div className="space-y-3">
                    <h2 id="notfound-title" className="text-2xl font-bold text-foreground">
                        {t(messageKeys.title)}
                    </h2>
                    <p className="leading-relaxed text-muted-foreground">{t(messageKeys.description)}</p>
                </div>

                <div className="flex justify-center gap-3 pt-4">
                    <Button variant="outline" onClick={handleGoBack} aria-label={t(messageKeys.secondaryAction)}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        <span>{t(messageKeys.secondaryAction)}</span>
                    </Button>
                    <Button
                        onClick={handleGoHome}
                        className="bg-orange-500 text-white hover:bg-orange-600"
                        aria-label={t(messageKeys.primaryAction)}
                    >
                        <Home className="mr-2 h-4 w-4" />
                        <span>{t(messageKeys.primaryAction)}</span>
                    </Button>
                </div>
            </div>
        </div>
    );
};
