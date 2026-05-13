import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useSearchParams } from 'react-router-dom';

import { LogIn } from 'lucide-react';

import { ApiKeyDialog } from '@flows/shared';
import { Button } from '@flows/ui-kit';
import { HOST, SOCIAL_OAUTH_ENDPOINT, useWebCoreStore, validateApiKey } from '@flows/web-core';

const CODES_URL = import.meta.env.VITE_CODES_URL;

export const LoginPage = () => {
    const { t } = useTranslation(['common']);
    const location = useLocation();
    const [searchParams] = useSearchParams();
    // Read "from" from query param (?from=) or location state
    const fromPath = searchParams.get('from') || (location.state as { from?: string } | null)?.from || '/editor';
    const { setApiKey } = useWebCoreStore();
    const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
    const [apiKeyError, setApiKeyError] = useState<string | null>(null);

    const handleGoogleLogin = () => {
        const redirectUrl = `${HOST}/auth/oauth-response`;
        const stateObj = { from: fromPath };
        const stateParam = encodeURIComponent(JSON.stringify(stateObj));

        window.location.replace(
            `${SOCIAL_OAUTH_ENDPOINT}/oauth/google/authorize?redirect=${redirectUrl}&state=${stateParam}`
        );
    };

    const handleApiKeySubmit = async (key: string): Promise<boolean> => {
        setApiKeyError(null);
        const isValid = await validateApiKey(key);
        if (isValid) {
            setApiKey(key);
            const redirectTo = fromPath;
            window.location.href = redirectTo;
            return true;
        }
        setApiKeyError('Invalid API key. Please try again.');
        return false;
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-background">
            <div className="flex w-full max-w-sm flex-col items-center gap-6 px-4">
                <div className="flex flex-col items-center gap-2">
                    <h1 className="text-2xl font-bold text-foreground">Eureka Flow</h1>
                    <p className="text-sm text-muted-foreground">{t('auth.loginDescription', 'Sign in to continue')}</p>
                </div>

                <div className="flex w-full flex-col gap-3">
                    <Button className="h-11 w-full gap-2 text-sm" onClick={handleGoogleLogin}>
                        <LogIn className="h-4 w-4" />
                        {t('auth.googleLogin', 'Sign in with Google')}
                    </Button>

                    <div className="relative flex items-center gap-3">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-xs text-muted-foreground">{t('auth.or', 'or')}</span>
                        <div className="h-px flex-1 bg-border" />
                    </div>

                    <Button variant="outline" className="h-11 w-full text-sm" onClick={() => setShowApiKeyDialog(true)}>
                        {t('auth.useApiKey', 'Use API Key')}
                    </Button>
                </div>

                <ApiKeyDialog
                    open={showApiKeyDialog}
                    onSubmit={handleApiKeySubmit}
                    onOpenChange={setShowApiKeyDialog}
                    error={apiKeyError}
                    codesUrl={CODES_URL}
                />
            </div>
        </div>
    );
};
