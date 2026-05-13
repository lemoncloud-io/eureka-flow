import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { HelpCircle, Link2, LoaderCircle, X } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { Button, Input } from '@flows/ui-kit';
import { API_URL, fetchOrCreateApiKey, useWebCoreStore } from '@flows/web-core';

import { AuthBrandHeader } from '../components/AuthBrandHeader';

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
            // Navigate to success page with key data
            navigate(`/auth/key-created?from=${encodeURIComponent(fromPath)}`, {
                replace: true,
                state: { apiKey, keyName: keyName.trim() },
            });
        } catch (err) {
            console.error('[KeyCreation] Failed:', err);
            setError(t('auth.keyCreationFailed', '키 생성에 실패했습니다. 다시 시도해 주세요.'));
            setIsCreating(false);
            setIsPropagating(false);
        }
    }, [keyName, isCreating, navigate, fromPath, t]);

    const handleAlreadyHaveKey = () => {
        navigate('/auth/login?mode=apikey', { replace: true });
    };

    const handleSkip = () => {
        navigate('/flows', { replace: true });
    };

    // Loading state — spinner only (matches Figma 78:2501)
    if (isPropagating) {
        return (
            <div className="relative flex min-h-screen items-center justify-center bg-white">
                <AuthBrandHeader />
                <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const isEmpty = !keyName.trim();
    const isDisabled = isEmpty || isCreating;

    return (
        <div className="relative flex min-h-screen items-center justify-center bg-white">
            <AuthBrandHeader />

            <div className="flex w-full max-w-[520px] flex-col items-center gap-8 px-6">
                {/* Key icon */}
                <Link2 className="h-6 w-6 text-[#9fa2a7]" />

                {/* Title */}
                <div className="text-center">
                    <p className="text-lg leading-relaxed tracking-[-0.54px] text-black">
                        EurekaFlow 사용에 필요한 <strong>EurekaAPI 키</strong>가 필요해요.
                    </p>
                    <p className="text-lg leading-relaxed tracking-[-0.54px] text-black">
                        <strong>EurekaAPI 키</strong>를 생성해 주세요.
                    </p>
                </div>

                <div className="flex w-full max-w-[420px] flex-col gap-5">
                    {/* Tooltip */}
                    <div className="flex items-center justify-center gap-1">
                        <span className="text-sm text-[#9fa2a7]">{t('auth.whatIsApiKey', 'EurekaAPI 키 란?')}</span>
                        <button
                            className="relative text-[#9fa2a7] transition-colors hover:text-black"
                            onClick={() => setShowTooltip(!showTooltip)}
                        >
                            <HelpCircle className="h-3.5 w-3.5" />
                            {showTooltip && (
                                <div className="absolute left-1/2 top-full z-10 mt-2 w-72 -translate-x-1/2">
                                    {/* Arrow */}
                                    <div className="mx-auto h-0 w-0 border-x-[8px] border-b-[8px] border-x-transparent border-b-[#3a3d42]" />
                                    <div className="rounded-lg bg-[#3a3d42] p-4 shadow-lg">
                                        <p className="text-xs leading-relaxed text-white">
                                            {t(
                                                'auth.apiKeyExplanation',
                                                'API는 서로 다른 서비스 정보를 주고받을 수 있도록 연결해주는 기능입니다.'
                                            )}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </button>
                    </div>

                    {/* Key name input */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-black">{t('auth.keyName', '키 이름')}</label>
                        <div className="relative">
                            <Input
                                value={keyName}
                                onChange={e => {
                                    setKeyName(e.target.value);
                                    if (error) setError(null);
                                }}
                                placeholder={t('auth.keyNamePlaceholder', '키 이름 입력 (예: 플로우 사용 api)')}
                                className={cn(
                                    'h-11 rounded-none border-0 border-b border-[#dfe0e2] pr-9 text-base shadow-none focus-visible:ring-0 focus-visible:border-black',
                                    error && 'border-red-500 focus-visible:border-red-500'
                                )}
                                disabled={isCreating}
                            />
                            {keyName && !isCreating && (
                                <button
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9fa2a7] transition-colors hover:text-black"
                                    onClick={() => setKeyName('')}
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        {error ? (
                            <p className="text-xs text-red-500">{error}</p>
                        ) : (
                            <p className="text-xs text-[#9fa2a7]">
                                {t('auth.keyNameHint', '기본 설정된 API 키 이름은 수정이 가능합니다.')}
                            </p>
                        )}
                    </div>

                    {/* Create button — purple gradient */}
                    <Button
                        className={cn(
                            'h-12 w-full rounded-xl text-base font-medium',
                            !isDisabled &&
                                'bg-gradient-to-r from-[#9333ea] to-[#7c3aed] hover:from-[#7e22ce] hover:to-[#6d28d9]'
                        )}
                        onClick={handleCreate}
                        disabled={isDisabled}
                    >
                        {isCreating ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                            t('auth.createKey', '키 생성')
                        )}
                    </Button>
                </div>

                {/* Bottom links */}
                <div className="flex items-center gap-6">
                    <button
                        className="text-sm text-[#9fa2a7] transition-colors hover:text-black"
                        onClick={handleAlreadyHaveKey}
                    >
                        {t('auth.alreadyHaveKey', '이미 키가 있어요')} &gt;
                    </button>
                    <button className="text-sm text-[#9fa2a7] transition-colors hover:text-black" onClick={handleSkip}>
                        {t('auth.skipForNow', '나중에 하기')} &gt;
                    </button>
                </div>
            </div>
        </div>
    );
};
