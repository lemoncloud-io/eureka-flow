import { useTranslation } from 'react-i18next';

import { useTheme } from '@flows/theme';

import { useInView } from '../hooks';

export const ScreenshotSection = () => {
    const { t } = useTranslation('landing');
    const { isDarkTheme } = useTheme();
    const { ref, isInView } = useInView();

    return (
        <div
            ref={ref}
            className={`mx-auto max-w-[1200px] px-6 pb-28 transition-all duration-1000 ${
                isInView ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
            }`}
        >
            <div className="landing-screenshot overflow-hidden rounded-2xl border border-border/30 shadow-2xl">
                <div className="flex items-center gap-2 border-b border-border/30 bg-muted/20 px-4 py-2.5">
                    <div className="flex gap-1.5">
                        <span className="block h-2.5 w-2.5 rounded-full bg-red-400/70" />
                        <span className="block h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
                        <span className="block h-2.5 w-2.5 rounded-full bg-green-400/70" />
                    </div>
                    <div className="mx-auto font-mono text-[11px] tracking-wide text-muted-foreground/50">
                        {t('screenshot.url_bar')}
                    </div>
                </div>
                <img
                    src={isDarkTheme ? '/images/screenshot-dark.jpg' : '/images/screenshot-light.jpg'}
                    alt={t('screenshot.alt')}
                    className="block aspect-video w-full"
                    loading="lazy"
                    width={1200}
                    height={675}
                />
            </div>
        </div>
    );
};
