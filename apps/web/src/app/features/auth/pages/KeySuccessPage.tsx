import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
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
            toast.success(t('auth.keyCopied'));
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error(t('auth.copyFailed'));
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
        if (!apiKey) {
            navigate('/auth/create-key', { replace: true });
            return;
        }
        toast.success(t('auth.keyCreatedSuccess'));
    }, [apiKey, navigate, t]);

    if (!apiKey) return null;

    return (
        <div className="relative flex min-h-screen flex-col items-center bg-background pt-24">
            <AuthBrandHeader />

            <div className="flex w-full max-w-[600px] flex-col items-center gap-6 px-6">
                <Link2 className="h-6 w-6 text-muted-foreground" />

                <h1 className="text-xl font-semibold tracking-[-0.6px] text-foreground">
                    <Trans i18nKey="auth.keyCreatedTitle" ns="common" components={{ strong: <strong /> }} />
                </h1>

                {/* Security notice card */}
                <div className="w-full rounded-xl border border-border p-6">
                    <div className="mb-3 flex justify-center">
                        <Info className="h-5 w-5 text-muted-foreground" />
                    </div>

                    <p className="mb-5 whitespace-pre-line text-center text-[13px] leading-relaxed text-muted-foreground">
                        {t('auth.securityNotice')}
                    </p>

                    {/* API key display */}
                    <div className="mb-4 flex flex-col gap-1.5">
                        <span className="text-xs text-muted-foreground">{t('auth.apiKeyLabel')}</span>
                        <div className="relative overflow-hidden rounded-lg bg-[#1e1e1e] px-4 py-3 pr-10 dark:bg-[#0a0a0a]">
                            <code className="block overflow-x-auto whitespace-nowrap text-xs leading-relaxed text-green-400 select-all">
                                {apiKey}
                            </code>
                            <button
                                className="absolute right-3 top-3 text-muted-foreground transition-colors hover:text-white"
                                onClick={handleCopy}
                            >
                                {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>

                    <Button variant="outline" className="h-11 w-full gap-2 rounded-lg text-sm" onClick={handleCopy}>
                        <Copy className="h-4 w-4" />
                        {copied ? t('auth.copied') : t('auth.copyApiKey')}
                    </Button>
                </div>

                <div className="h-px w-full bg-border" />

                {/* Created key info */}
                <div className="flex w-full flex-col gap-2">
                    <div className="text-sm font-semibold text-foreground">&lt;{keyName || 'API Key'}&gt;</div>
                    <div className="text-xs text-muted-foreground">
                        {t('auth.createdAt', { date: new Date().toLocaleDateString() })}
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-border px-4 py-3">
                        <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-sm text-foreground">
                            {showKey ? apiKey : maskApiKey(apiKey)}
                        </span>
                        <button
                            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                            onClick={() => setShowKey(!showKey)}
                        >
                            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </div>
                </div>

                <Button
                    className="h-12 w-full rounded-xl bg-gradient-to-r from-[#9333ea] to-[#7c3aed] text-base font-medium hover:from-[#7e22ce] hover:to-[#6d28d9]"
                    onClick={handleComplete}
                >
                    {t('auth.complete')}
                </Button>

                <button
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    onClick={handleRegenerate}
                >
                    {t('auth.regenerateKey')} &gt;
                </button>
            </div>
        </div>
    );
};
