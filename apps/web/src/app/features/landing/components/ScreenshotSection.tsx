import { useTranslation } from 'react-i18next';

import { useTheme } from '@flows/theme';

import { staggerStyle } from '../consts';

export const ScreenshotSection = () => {
    const { t } = useTranslation('landing');
    const { isDarkTheme } = useTheme();

    return (
        <div className="animate-fade-in-up mx-auto max-w-[1400px] px-6 pb-20" style={staggerStyle(4)}>
            <div className="overflow-hidden rounded-xl border border-border/40 shadow-2xl">
                <div className="flex items-center gap-2 border-b border-border/40 bg-muted/30 px-4 py-2">
                    <div className="flex gap-1.5">
                        <span className="block h-2.5 w-2.5 rounded-full bg-red-400/80" />
                        <span className="block h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
                        <span className="block h-2.5 w-2.5 rounded-full bg-green-400/80" />
                    </div>
                    <div className="mx-auto text-[11px] text-muted-foreground/60">{t('screenshot.url_bar')}</div>
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
