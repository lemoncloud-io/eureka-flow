import { useTranslation } from 'react-i18next';

import { Badge } from '@flows/ui-kit';

import { staggerStyle } from '../consts';

export const HeroSection = () => {
    const { t } = useTranslation('landing');

    return (
        <section className="landing-hero-gradient relative flex items-center justify-center px-6 pt-28 pb-8 sm:pt-36 sm:pb-12">
            <div className="mx-auto max-w-4xl text-center">
                <div className="animate-fade-in-up mb-6" style={staggerStyle(0)}>
                    <Badge variant="secondary" className="rounded-full px-4 py-1 text-xs font-medium">
                        {t('hero.badge')}
                    </Badge>
                </div>
                <h1
                    className="animate-fade-in-up mb-5 text-[clamp(2rem,5vw,4rem)] font-bold leading-[1.08] tracking-tight text-balance"
                    style={staggerStyle(1)}
                >
                    {t('hero.title.line1')}{' '}
                    <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                        {t('hero.title.accent')}
                    </span>
                    <br className="hidden sm:block" /> {t('hero.title.line2')}
                </h1>
                <p
                    className="animate-fade-in-up mx-auto max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg"
                    style={staggerStyle(2)}
                >
                    {t('hero.subtitle')}
                </p>
            </div>
        </section>
    );
};
