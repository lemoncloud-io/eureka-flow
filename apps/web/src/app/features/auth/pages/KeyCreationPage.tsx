import { useCallback, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { HelpCircle, Link2, LoaderCircle, X } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { ApiKeyDialog } from '@flows/shared';
import { Button, Input } from '@flows/ui-kit';
import { API_URL, fetchOrCreateApiKey, useWebCoreStore, validateApiKey } from '@flows/web-core';

import { AuthBrandHeader } from '../components/AuthBrandHeader';

const waitForKeyPropagation = async (apiKey: string, maxAttempts = 5): Promise<void> => {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        try {
            const res = await fetch(`${API_URL}/_api_/flows/0/profile`, {
                headers: { 'x-api-key': apiKey },
            });
            if (res.ok) return;
        } catch {
            // Network error — retry
        }
    }
};

export const KeyCreationPage = () => {
    const { t } = useTranslation(['common']);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const fromPath = searchParams.get('from') || '/editor';
    const { setApiKey, userName } = useWebCoreStore();

    const [keyName, setKeyName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [isPropagating, setIsPropagating] = useState(false);
    const [showTooltip, setShowTooltip] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);

    useEffect(() => {
        const prefix = userName || 'flow';
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        setKeyName(`${prefix}${randomSuffix}`);
    }, [userName]);

    const handleCreate = useCallback(async () => {
        if (!keyName.trim() || isCreating) return;

        setError(null);
        setIsCreating(true);
        try {
            const apiKey = await fetchOrCreateApiKey(keyName.trim());
            setIsPropagating(true);
            await waitForKeyPropagation(apiKey);
            navigate(`/auth/key-created?from=${encodeURIComponent(fromPath)}`, {
                replace: true,
                state: { apiKey, keyName: keyName.trim() },
            });
        } catch (err) {
            console.error('[KeyCreation] Failed:', err);
            setError(t('auth.keyCreationFailed'));
            setIsCreating(false);
            setIsPropagating(false);
        }
    }, [keyName, isCreating, navigate, fromPath, t]);

    const handleAlreadyHaveKey = () => {
        setShowApiKeyDialog(true);
    };

    const handleApiKeySubmit = async (key: string): Promise<boolean> => {
        const isValid = await validateApiKey(key);
        if (isValid) {
            setApiKey(key);
            navigate(fromPath, { replace: true });
            return true;
        }
        return false;
    };

    const handleSkip = () => {
        navigate('/flows', { replace: true });
    };

    if (isPropagating) {
        return (
            <div className="relative flex min-h-dvh flex-col items-center justify-center gap-4 overflow-y-auto bg-background">
                <AuthBrandHeader />
                <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">{t('auth.preparingKey')}</p>
            </div>
        );
    }

    const isEmpty = !keyName.trim();
    const isDisabled = isEmpty || isCreating;

    return (
        <div className="relative flex min-h-dvh items-center justify-center overflow-y-auto bg-background py-12">
            <AuthBrandHeader />

            <div className="flex w-full max-w-[520px] flex-col items-center gap-8 px-6">
                <Link2 className="h-6 w-6 text-muted-foreground" />

                <div className="text-center text-lg leading-relaxed tracking-[-0.54px] text-foreground">
                    <Trans i18nKey="auth.keyRequiredTitle" ns="common" components={{ strong: <strong /> }} />
                </div>

                <div className="flex w-full max-w-[420px] flex-col gap-5">
                    <div className="flex items-center justify-center gap-1">
                        <span className="text-sm text-muted-foreground">{t('auth.whatIsApiKey')}</span>
                        <button
                            className="relative text-muted-foreground transition-colors hover:text-foreground"
                            onClick={() => setShowTooltip(!showTooltip)}
                        >
                            <HelpCircle className="h-3.5 w-3.5" />
                            {showTooltip && (
                                <div className="absolute left-1/2 top-full z-10 mt-2 w-72 -translate-x-1/2">
                                    <div className="mx-auto h-0 w-0 border-x-[8px] border-b-[8px] border-x-transparent border-b-popover" />
                                    <div className="rounded-lg bg-popover p-4 text-popover-foreground shadow-lg">
                                        <p className="text-xs leading-relaxed">{t('auth.apiKeyExplanation')}</p>
                                    </div>
                                </div>
                            )}
                        </button>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-foreground">{t('auth.keyName')}</label>
                        <div className="relative">
                            <Input
                                value={keyName}
                                onChange={e => {
                                    setKeyName(e.target.value);
                                    if (error) setError(null);
                                }}
                                placeholder={t('auth.keyNamePlaceholder')}
                                className={cn(
                                    'h-11 rounded-none border-0 border-b border-border pr-9 text-base shadow-none focus-visible:border-foreground focus-visible:ring-0',
                                    error && 'border-destructive focus-visible:border-destructive'
                                )}
                                disabled={isCreating}
                            />
                            {keyName && !isCreating && (
                                <button
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                                    onClick={() => setKeyName('')}
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        {error ? (
                            <p className="text-xs text-destructive">{error}</p>
                        ) : (
                            <p className="text-xs text-muted-foreground">{t('auth.keyNameHint')}</p>
                        )}
                    </div>

                    <Button
                        className={cn(
                            'h-12 w-full rounded-xl text-base font-medium',
                            !isDisabled &&
                                'bg-gradient-to-r from-[#9333ea] to-[#7c3aed] hover:from-[#7e22ce] hover:to-[#6d28d9]'
                        )}
                        onClick={handleCreate}
                        disabled={isDisabled}
                    >
                        {isCreating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : t('auth.createKey')}
                    </Button>
                </div>

                <div className="flex items-center gap-6">
                    <button
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                        onClick={handleAlreadyHaveKey}
                    >
                        {t('auth.alreadyHaveKey')} &gt;
                    </button>
                    <button
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                        onClick={handleSkip}
                    >
                        {t('auth.skipForNow')} &gt;
                    </button>
                </div>
            </div>

            <ApiKeyDialog
                open={showApiKeyDialog}
                onSubmit={handleApiKeySubmit}
                onOpenChange={setShowApiKeyDialog}
                hideCreateButton
            />
        </div>
    );
};
