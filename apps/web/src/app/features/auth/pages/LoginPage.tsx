import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useSearchParams } from 'react-router-dom';

import { ApiKeyDialog } from '@flows/shared';
import { Button } from '@flows/ui-kit';
import { HOST, SOCIAL_OAUTH_ENDPOINT, useWebCoreStore, validateApiKey } from '@flows/web-core';

const CODES_URL = import.meta.env.VITE_CODES_URL;

export const LoginPage = () => {
    const { t } = useTranslation(['common']);
    const location = useLocation();
    const [searchParams] = useSearchParams();
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
            window.location.href = fromPath;
            return true;
        }
        setApiKeyError('Invalid API key. Please try again.');
        return false;
    };

    return (
        <div className="flex min-h-screen bg-white">
            {/* Left: Screenshot + Marketing */}
            <div className="relative hidden w-1/2 lg:block">
                {/* Flow editor screenshot */}
                <div className="absolute left-[46px] top-[46px] overflow-hidden rounded-[22px] shadow-[0px_4px_12px_0px_rgba(0,0,0,0.08)] border border-[#f4f5f5]">
                    <img
                        src="/images/screenshot-light.jpg"
                        alt="Eureka Flow Editor"
                        className="h-auto w-[999px] max-w-none object-cover"
                    />
                </div>

                {/* Bottom marketing copy */}
                <div className="absolute bottom-0 left-0 right-0">
                    <div className="relative bg-white px-[62px] pb-[82px] pt-[42px]">
                        <div
                            className="absolute -top-[67px] left-0 right-0 h-[109px]"
                            style={{
                                background:
                                    'linear-gradient(rgba(255,255,255,0.01) 0%, rgba(255,255,255,0.48) 29%, rgba(255,255,255,0.8) 59%, rgb(255,255,255) 100%)',
                            }}
                        />
                        <div className="relative flex flex-col gap-[11px]">
                            <h2 className="text-[32px] font-semibold leading-[1.4] tracking-[-0.96px] text-black">
                                {t('auth.marketingTitle', 'AI 워크플로우, 비주얼하게 코딩 없이 만드세요')}
                            </h2>
                            <div className="text-[19px] font-medium leading-[1.4] tracking-[-0.57px] text-[#84888f]">
                                <p>{t('auth.marketingLine1', '드래그앤 드롭으로 연결하고 실행하세요.')}</p>
                                <p>
                                    {t('auth.marketingLine2', '설치 없이 브라우저에서바로 AI 파이프라인을 완성합니다.')}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right: Login Form */}
            <div className="flex w-full items-center justify-center lg:w-1/2">
                <div className="flex w-[348px] flex-col items-center gap-[75px]">
                    {/* Logo + Welcome */}
                    <div className="flex flex-col items-center gap-[26px]">
                        <img
                            src="/logo/purple-symbol.png"
                            alt="Eureka Flow"
                            className="h-[92px] w-[87px] object-contain"
                        />
                        <div className="flex flex-col items-center gap-3 text-center">
                            <h1 className="text-[32px] font-semibold tracking-[-0.96px] text-black">
                                Welcome To Eureka Flow
                            </h1>
                            <p className="text-lg tracking-[-0.54px] text-[#9fa2a7]">
                                {t('auth.loginDescription', 'Sign in to continue')}
                            </p>
                        </div>
                    </div>

                    {/* Login Buttons */}
                    <div className="flex w-full flex-col gap-3">
                        <button
                            className="flex items-center gap-4 rounded-[14px] border border-[#dfe0e2] bg-white px-[56px] py-[22px] transition-shadow hover:shadow-md"
                            onClick={handleGoogleLogin}
                        >
                            <img
                                src="/images/google-icon.svg"
                                alt="Google"
                                className="h-[21px] w-[21px]"
                                onError={e => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                }}
                            />
                            <span className="text-lg font-medium tracking-[-0.54px] text-black">
                                {t('auth.googleLogin', 'Continue with Google')}
                            </span>
                        </button>

                        <div className="flex items-center gap-3 py-2">
                            <div className="h-px flex-1 bg-[#f4f5f5]" />
                            <span className="text-xs text-[#9fa2a7]">{t('auth.or', 'or')}</span>
                            <div className="h-px flex-1 bg-[#f4f5f5]" />
                        </div>

                        <Button
                            variant="outline"
                            className="h-12 w-full rounded-[14px] text-sm"
                            onClick={() => setShowApiKeyDialog(true)}
                        >
                            {t('auth.useApiKey', 'Use API Key')}
                        </Button>
                    </div>
                </div>
            </div>

            <ApiKeyDialog
                open={showApiKeyDialog}
                onSubmit={handleApiKeySubmit}
                onOpenChange={setShowApiKeyDialog}
                error={apiKeyError}
                codesUrl={CODES_URL}
            />
        </div>
    );
};
