import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { Check, Copy, Eye, EyeOff, Link2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@flows/ui-kit';
import { useWebCoreStore } from '@flows/web-core';

import { AuthBrandHeader } from '../components/AuthBrandHeader';

const maskApiKey = (key: string): string => {
    if (key.length <= 10) return '•'.repeat(key.length);
    return key.slice(0, 6) + '•'.repeat(Math.min(key.length - 10, 30)) + key.slice(-4);
};

export const KeySuccessPage = () => {
    const { t } = useTranslation(['common']);
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const fromPath = searchParams.get('from') || '/editor';

    const state = location.state as { apiKey?: string; keyName?: string } | null;
    const apiKey = state?.apiKey || '';
    const keyName = state?.keyName || '';

    const { setApiKey } = useWebCoreStore();
    const [copied, setCopied] = useState(false);
    const [showKey, setShowKey] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(apiKey);
            setCopied(true);
            toast.success(t('auth.keyCopied', 'API 키가 복사되었습니다.'));
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error(t('auth.copyFailed', '복사에 실패했습니다.'));
        }
    };

    const handleComplete = () => {
        setApiKey(apiKey);
        navigate(fromPath, { replace: true });
    };

    const handleRegenerate = () => {
        navigate(`/auth/create-key?from=${encodeURIComponent(fromPath)}`, { replace: true });
    };

    // Guard: if no apiKey in state, redirect back
    useEffect(() => {
        if (!apiKey) navigate('/auth/create-key', { replace: true });
    }, [apiKey, navigate]);

    if (!apiKey) return null;

    return (
        <div className="relative flex min-h-screen items-center justify-center bg-white">
            <AuthBrandHeader />

            <div className="flex w-full max-w-[520px] flex-col items-center gap-8 px-6">
                {/* Key icon */}
                <Link2 className="h-6 w-6 text-[#9fa2a7]" />

                {/* Title */}
                <h1 className="text-xl font-semibold tracking-[-0.6px] text-black">
                    <strong>EurekaAPI 키</strong>가 생성되었어요.
                </h1>

                <div className="flex w-full max-w-[420px] flex-col gap-6">
                    {/* Security notice */}
                    <div className="rounded-xl border border-[#f4f5f5] bg-[#fafafa] p-5">
                        <p className="mb-4 text-center text-xs leading-relaxed text-[#84888f]">
                            보안상의 이유로 생성된 EurekaAPI 키를 다시 확인할 수 없습니다.
                            <br />
                            EurekaAPI를 복사하여, 비밀번호 처럼 안전하게 보관해주세요.
                        </p>

                        {/* Raw API key display */}
                        <div className="mb-3 flex flex-col gap-1">
                            <span className="text-xs text-[#9fa2a7]">API 키</span>
                            <div className="overflow-x-auto rounded-lg bg-[#2d2d2d] px-4 py-3">
                                <code className="whitespace-nowrap text-xs text-primary select-all">{apiKey}</code>
                            </div>
                        </div>

                        {/* Copy button */}
                        <Button variant="outline" className="h-10 w-full gap-2 rounded-lg text-sm" onClick={handleCopy}>
                            {copied ? (
                                <>
                                    <Check className="h-4 w-4" />
                                    {t('auth.copied', '복사됨')}
                                </>
                            ) : (
                                <>
                                    <Copy className="h-4 w-4" />
                                    {t('auth.copyApiKey', 'EurekaAPI 키 복사')}
                                </>
                            )}
                        </Button>
                    </div>

                    {/* Created key info */}
                    <div className="flex flex-col gap-2">
                        <div className="text-sm font-medium text-black">&lt;생성된 API키 이름으로 노출&gt;</div>
                        <div className="text-xs text-[#9fa2a7]">생성일: {new Date().toLocaleDateString('ko-KR')}</div>
                        <div className="flex items-center gap-2 rounded-lg border border-[#f4f5f5] px-4 py-3">
                            <span className="flex-1 overflow-hidden text-ellipsis text-sm text-black">
                                {showKey ? apiKey : maskApiKey(apiKey)}
                            </span>
                            <button
                                className="text-[#9fa2a7] transition-colors hover:text-black"
                                onClick={() => setShowKey(!showKey)}
                            >
                                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>

                    {/* Complete button — purple gradient */}
                    <Button
                        className="h-12 w-full rounded-xl bg-gradient-to-r from-[#9333ea] to-[#7c3aed] text-base font-medium hover:from-[#7e22ce] hover:to-[#6d28d9]"
                        onClick={handleComplete}
                    >
                        {t('auth.complete', '완료')}
                    </Button>

                    {/* Regenerate link */}
                    <button
                        className="text-center text-sm text-[#9fa2a7] transition-colors hover:text-black"
                        onClick={handleRegenerate}
                    >
                        {t('auth.regenerateKey', 'EurekaAPI 키 다시 생성')} &gt;
                    </button>
                </div>

                {/* Bottom toast-like banner */}
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-[#3a3d42] px-6 py-3 shadow-lg">
                    <p className="whitespace-nowrap text-sm text-white">
                        {t('auth.keyCreatedSuccess', 'API 키 생성이 완료되었습니다.')}
                    </p>
                </div>
            </div>
        </div>
    );
};
