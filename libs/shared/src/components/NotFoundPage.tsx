import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { ArrowLeft, Home } from 'lucide-react';

import { Button } from '@flows/ui-kit';

import { ERROR_MESSAGES } from '../consts';

const messages = ERROR_MESSAGES.notFound;

export const NotFoundPage = (): JSX.Element => {
    const navigate = useNavigate();
    const containerRef = useRef<HTMLDivElement>(null);

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
                        {messages.title}
                    </h2>
                    <p className="leading-relaxed text-muted-foreground">{messages.description}</p>
                </div>

                <div className="flex justify-center gap-3 pt-4">
                    <Button variant="outline" onClick={handleGoBack} aria-label={messages.secondaryAction}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        <span>{messages.secondaryAction}</span>
                    </Button>
                    <Button
                        onClick={handleGoHome}
                        className="bg-orange-500 text-white hover:bg-orange-600"
                        aria-label={messages.primaryAction}
                    >
                        <Home className="mr-2 h-4 w-4" />
                        <span>{messages.primaryAction}</span>
                    </Button>
                </div>
            </div>
        </div>
    );
};
