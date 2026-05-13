import { useTranslation } from 'react-i18next';
import { useLocation, useSearchParams } from 'react-router-dom';

import { HOST, SOCIAL_OAUTH_ENDPOINT } from '@flows/web-core';

export const LoginPage = () => {
    const { t } = useTranslation(['common']);
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const fromPath = searchParams.get('from') || (location.state as { from?: string } | null)?.from || '/editor';

    const handleGoogleLogin = () => {
        const redirectUrl = `${HOST}/auth/oauth-response`;
        const stateObj = { from: fromPath };
        const stateParam = encodeURIComponent(JSON.stringify(stateObj));
        window.location.replace(
            `${SOCIAL_OAUTH_ENDPOINT}/oauth/google/authorize?redirect=${redirectUrl}&state=${stateParam}`
        );
    };

    return (
        <div className="flex min-h-dvh bg-background">
            {/* Left: Screenshot + Marketing — desktop only */}
            <div className="relative hidden w-1/2 overflow-hidden lg:block">
                <div className="absolute left-[46px] top-[46px] overflow-hidden rounded-[22px] border border-border shadow-[0px_4px_12px_0px_rgba(0,0,0,0.08)]">
                    <img
                        src="/images/screenshot-light.jpg"
                        alt="Eureka Flow Editor"
                        className="block h-auto w-[999px] max-w-none object-cover dark:hidden"
                    />
                    <img
                        src="/images/screenshot-dark.jpg"
                        alt="Eureka Flow Editor"
                        className="hidden h-auto w-[999px] max-w-none object-cover dark:block"
                    />
                </div>

                <div className="absolute bottom-0 left-0 right-0">
                    <div className="relative bg-background px-[62px] pb-[82px] pt-[42px]">
                        <div className="absolute -top-[67px] left-0 right-0 h-[109px] bg-gradient-to-b from-transparent to-background" />
                        <div className="relative flex flex-col gap-[11px]">
                            <h2 className="text-[32px] font-semibold leading-[1.4] tracking-[-0.96px] text-foreground">
                                {t('auth.marketingTitle')}
                            </h2>
                            <div className="text-[19px] font-medium leading-[1.4] tracking-[-0.57px] text-muted-foreground">
                                <p>{t('auth.marketingLine1')}</p>
                                <p>{t('auth.marketingLine2')}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right: Login Form — always visible */}
            <div className="relative flex w-full items-center justify-center px-6 py-12 lg:w-1/2 lg:px-0 lg:py-0">
                {/* Left edge blur — frosted glass boundary between panels */}
                <div className="pointer-events-none absolute -left-16 top-0 hidden h-full w-32 bg-gradient-to-r from-transparent to-background lg:block" />
                <div className="relative z-10 flex w-full max-w-[340px] flex-col items-center gap-10 sm:gap-12">
                    <div className="flex flex-col items-center gap-5">
                        <img
                            src="/logo/purple-symbol.png"
                            alt="Eureka Flow"
                            className="h-14 w-14 object-contain sm:h-16 sm:w-16"
                        />
                        <div className="flex flex-col items-center gap-2 text-center">
                            <h1 className="text-xl font-semibold tracking-[-0.5px] text-foreground sm:text-2xl">
                                Welcome To Eureka Flow
                            </h1>
                            <p className="text-sm tracking-[-0.2px] text-muted-foreground">
                                {t('auth.loginDescription')}
                            </p>
                        </div>
                    </div>

                    <div className="flex w-full flex-col gap-2.5">
                        <button
                            className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-border bg-background text-[15px] font-medium tracking-[-0.3px] text-foreground transition-all hover:border-foreground/20 hover:shadow-sm active:scale-[0.98]"
                            onClick={handleGoogleLogin}
                        >
                            <img
                                src="/images/google-icon.svg"
                                alt="Google"
                                className="h-[18px] w-[18px]"
                                onError={e => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                }}
                            />
                            {t('auth.googleLogin')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
