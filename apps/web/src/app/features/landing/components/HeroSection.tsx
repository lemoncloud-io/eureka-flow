import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Globe } from 'lucide-react';

import { Button } from '@flows/ui-kit';

import { ROUTES, staggerStyle } from '../consts';
import { shouldShowTutorial } from '../utils';

export const HeroSection = () => {
    const navigate = useNavigate();
    const { t } = useTranslation('landing');

    const handleStart = () => navigate(shouldShowTutorial() ? ROUTES.TUTORIAL : ROUTES.EDITOR);
    const handleExplore = () => navigate(ROUTES.EXPLORE);

    return (
        <section className="relative mx-auto max-w-4xl px-6 pt-28 pb-16 text-center">
            <h1
                className="animate-fade-in-up mb-5 text-[clamp(2rem,5vw,3.5rem)] font-bold leading-[1.1] tracking-tight"
                style={staggerStyle(1)}
            >
                {t('hero.title.line1')}
                <br />
                <span className="text-primary">{t('hero.title.accent')}</span>
                <br />
                {t('hero.title.line2')}
            </h1>
            <p
                className="animate-fade-in-up mx-auto mb-8 max-w-lg text-base leading-relaxed text-muted-foreground"
                style={staggerStyle(2)}
            >
                {t('hero.subtitle')}
            </p>
            <div
                className="animate-fade-in-up flex flex-col items-center justify-center gap-3 px-4 sm:flex-row sm:gap-3 sm:px-0"
                style={staggerStyle(3)}
            >
                <Button size="lg" className="w-full sm:w-auto" onClick={handleStart}>
                    {t('hero.cta_primary')}
                </Button>
                <Button variant="outline" size="lg" className="w-full gap-2 sm:w-auto" onClick={handleExplore}>
                    <Globe size={16} />
                    {t('hero.cta_explore')}
                </Button>
            </div>
        </section>
    );
};
