import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { HelpCircle, LoaderCircle, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button, Input } from '@flows/ui-kit';
import { API_URL, fetchOrCreateApiKey, useWebCoreStore } from '@flows/web-core';

/** Validate key works by hitting profile endpoint with retry */
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
    // Give up after all attempts — key may still work, let the app try
};

const generateDefaultKeyName = (): string => {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    return `flow-${randomSuffix}`;
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

    // Generate default key name on mount
    useEffect(() => {
        const prefix = userName || 'flow';
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        setKeyName(`${prefix}${randomSuffix}`);
    }, [userName]);

    const handleCreate = useCallback(async () => {
        if (!keyName.trim() || isCreating) return;

        setIsCreating(true);
        try {
            const apiKey = await fetchOrCreateApiKey(keyName.trim());
            setIsPropagating(true);
            await waitForKeyPropagation(apiKey);
            setApiKey(apiKey);
            navigate(fromPath, { replace: true });
        } catch (error) {
            console.error('[KeyCreation] Failed:', error);
            toast.error(t('auth.keyCreationFailed', 'Failed to create key. Please try again.'));
            setIsCreating(false);
        }
    }, [keyName, isCreating, setApiKey, navigate, fromPath, t]);

    const handleAlreadyHaveKey = () => {
        // Go to login page with API key dialog mode
        navigate('/auth/login?mode=apikey', { replace: true });
    };

    const handleSkip = () => {
        navigate('/flows', { replace: true });
    };

    if (isPropagating) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
                <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">{t('auth.preparingKey', '키를 준비하고 있어요...')}</p>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-background">
            <div className="flex w-full max-w-md flex-col items-center gap-6 px-6">
                <div className="flex flex-col items-center gap-3 text-center">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        {t(
                            'auth.keyRequiredDescription',
                            'EurekaFlow 사용에 필요한 EurekaAPI 키가 필요해요.\nEurekaAPI 키를 생성해 주세요.'
                        )}
                    </p>
                </div>

                <div className="flex w-full flex-col gap-4">
                    {/* Tooltip */}
                    <div className="flex items-center gap-1.5">
                        <span className="text-sm text-muted-foreground">
                            {t('auth.whatIsApiKey', 'EurekaAPI 키 란?')}
                        </span>
                        <button
                            className="relative text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => setShowTooltip(!showTooltip)}
                        >
                            <HelpCircle className="h-3.5 w-3.5" />
                            {showTooltip && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-lg bg-popover border border-border p-3 shadow-lg z-10">
                                    <p className="text-xs text-popover-foreground">
                                        {t(
                                            'auth.apiKeyExplanation',
                                            'API는 서로 다른 서비스 정보를 주고받을 수 있도록 연결해주는 기능입니다.'
                                        )}
                                    </p>
                                </div>
                            )}
                        </button>
                    </div>

                    {/* Key name input */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-foreground">{t('auth.keyName', '키 이름')}</label>
                        <div className="relative">
                            <Input
                                value={keyName}
                                onChange={e => setKeyName(e.target.value)}
                                placeholder={t('auth.keyNamePlaceholder', '키 이름 입력 (예: 플로우 사용 api)')}
                                className="h-10 pr-8"
                                disabled={isCreating}
                            />
                            {keyName && (
                                <button
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    onClick={() => setKeyName('')}
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {t('auth.keyNameHint', '기본 설정된 API 키 이름은 수정이 가능합니다.')}
                        </p>
                    </div>

                    {/* Create button */}
                    <Button
                        className="h-11 w-full text-sm"
                        onClick={handleCreate}
                        disabled={!keyName.trim() || isCreating}
                    >
                        {isCreating ? t('auth.creatingKey', '생성 중...') : t('auth.createKey', '키 생성')}
                    </Button>
                </div>

                {/* Bottom links */}
                <div className="flex items-center gap-4">
                    <button
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        onClick={handleAlreadyHaveKey}
                    >
                        {t('auth.alreadyHaveKey', '이미 키가 있어요')} &gt;
                    </button>
                    <button
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        onClick={handleSkip}
                    >
                        {t('auth.skipForNow', '나중에 하기')} &gt;
                    </button>
                </div>
            </div>
        </div>
    );
};
