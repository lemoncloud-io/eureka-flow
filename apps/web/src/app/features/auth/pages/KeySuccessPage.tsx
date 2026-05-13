import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { Check, Copy, Eye, EyeOff, Info, Link2 } from 'lucide-react';
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

    useEffect(() => {
        if (!apiKey) navigate('/auth/create-key', { replace: true });
    }, [apiKey, navigate]);

    if (!apiKey) return null;

    return (
        <div className="relative flex min-h-screen flex-col items-center bg-white pt-24">
            <AuthBrandHeader />

            <div className="flex w-full max-w-[600px] flex-col items-center gap-6 px-6">
                {/* Key icon */}
                <Link2 className="h-6 w-6 text-[#9fa2a7]" />

                {/* Title */}
                <h1 className="text-xl font-semibold tracking-[-0.6px] text-black">
                    <strong>EurekaAPI 키</strong>가 생성되었어요.
                </h1>

                {/* Security notice card */}
                <div className="w-full rounded-xl border border-[#f4f5f5] p-6">
                    {/* Info icon */}
                    <div className="mb-3 flex justify-center">
                        <Info className="h-5 w-5 text-[#9fa2a7]" />
                    </div>

                    <p className="mb-5 text-center text-[13px] leading-relaxed text-[#84888f]">
                        보안상의 이유로 생성된 EurekaAPI 키를 다시 확인할 수 없습니다.
                        <br />
                        EurekaAPI를 복사하여, 비밀번호 처럼 안전하게 보관해주세요.
                    </p>

                    {/* API key display */}
                    <div className="mb-4 flex flex-col gap-1.5">
                        <span className="text-xs text-[#9fa2a7]">API 키</span>
                        <div className="relative overflow-hidden rounded-lg bg-[#2d2d2d] px-4 py-3 pr-10">
                            <code className="block overflow-x-auto whitespace-nowrap text-xs leading-relaxed text-[#a78bfa] select-all">
                                {apiKey}
                            </code>
                            <button
                                className="absolute right-3 top-3 text-[#9fa2a7] transition-colors hover:text-white"
                                onClick={handleCopy}
                            >
                                {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>

                    {/* Copy button */}
                    <Button
                        variant="outline"
                        className="h-11 w-full gap-2 rounded-lg border-[#dfe0e2] text-sm"
                        onClick={handleCopy}
                    >
                        <Copy className="h-4 w-4" />
                        {copied ? t('auth.copied', '복사됨') : t('auth.copyApiKey', 'EurekaAPI 키 복사')}
                    </Button>
                </div>

                {/* Divider */}
                <div className="h-px w-full bg-[#f4f5f5]" />

                {/* Created key info — show keyName */}
                <div className="flex w-full flex-col gap-2">
                    <div className="text-sm font-semibold text-black">&lt;{keyName || 'API Key'}&gt;</div>
                    <div className="text-xs text-[#9fa2a7]">생성일: {new Date().toLocaleDateString('ko-KR')}</div>
                    <div className="flex items-center gap-2 rounded-lg border border-[#f4f5f5] px-4 py-3">
                        <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-sm text-black">
                            {showKey ? apiKey : maskApiKey(apiKey)}
                        </span>
                        <button
                            className="shrink-0 text-[#9fa2a7] transition-colors hover:text-black"
                            onClick={() => setShowKey(!showKey)}
                        >
                            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </div>
                </div>

                {/* Complete button */}
                <Button
                    className="h-12 w-full rounded-xl bg-gradient-to-r from-[#9333ea] to-[#7c3aed] text-base font-medium hover:from-[#7e22ce] hover:to-[#6d28d9]"
                    onClick={handleComplete}
                >
                    {t('auth.complete', '완료')}
                </Button>

                {/* Regenerate link */}
                <button
                    className="text-sm text-[#9fa2a7] transition-colors hover:text-black"
                    onClick={handleRegenerate}
                >
                    {t('auth.regenerateKey', 'EurekaAPI 키 다시 생성')} &gt;
                </button>
            </div>

            {/* Bottom toast banner */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-2xl bg-[#3a3d42] px-8 py-3.5 shadow-xl">
                <p className="whitespace-nowrap text-sm font-medium text-white">
                    {t('auth.keyCreatedSuccess', 'API 키 생성이 완료되었습니다.')}
                </p>
            </div>
        </div>
    );
};
