import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import { LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';

import { createCredentialsByProvider, getWebCore, useWebCoreStore } from '@flows/web-core';

export const OAuthResponsePage = () => {
    const { setIsAuthenticated } = useWebCoreStore();
    const location = useLocation();
    const navigate = useNavigate();
    const hasRun = useRef(false);
    const { t } = useTranslation(['common']);

    useEffect(() => {
        if (hasRun.current) return;
        hasRun.current = true;

        const handleCallback = async () => {
            const params = new URLSearchParams(location.search);
            const code = params.get('code') || '';
            const provider = params.get('provider') || '';
            const stateParam = params.get('state') || '';

            if (code.length <= 5) {
                toast.error(t('auth.loginFailed', 'Login failed. Please try again.'));
                navigate('/auth/login', { replace: true });
                return;
            }

            try {
                const webCore = getWebCore();
                await webCore.logout();
                await createCredentialsByProvider(provider, code);
                setIsAuthenticated(true);

                // Parse original destination from state
                let from = '/editor';
                try {
                    const stateObj = JSON.parse(decodeURIComponent(stateParam));
                    if (stateObj.from) from = stateObj.from;
                } catch {
                    // No valid state
                }

                // Redirect to key creation page (user creates key after login)
                navigate(`/auth/create-key?from=${encodeURIComponent(from)}`, { replace: true });
            } catch {
                toast.error(t('auth.loginFailed', 'Login failed. Please try again.'));
                navigate('/auth/login', { replace: true });
            }
        };

        handleCallback();
    }, [location.search, navigate, setIsAuthenticated, t]);

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center backdrop-blur-sm bg-background/50">
            <LoaderCircle className="h-10 w-10 animate-spin text-muted-foreground" />
        </div>
    );
};
