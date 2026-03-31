import { useTranslation } from 'react-i18next';

import { useTheme } from '@flows/theme';

import { staggerStyle } from '../consts';

export const ScreenshotSection = () => {
    const { t } = useTranslation('landing');
    const { isDarkTheme } = useTheme();

    return (
        <div className="animate-fade-in-up mx-auto max-w-5xl px-6 pb-24" style={staggerStyle(4)}>
            <div className="overflow-hidden rounded-xl border border-border shadow-2xl">
                <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2.5">
                    <div className="flex gap-1.5">
                        <span className="block h-3 w-3 rounded-full bg-red-400" />
                        <span className="block h-3 w-3 rounded-full bg-yellow-400" />
                        <span className="block h-3 w-3 rounded-full bg-green-400" />
                    </div>
                    <div className="mx-auto text-xs text-muted-foreground">{t('screenshot.url_bar')}</div>
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
