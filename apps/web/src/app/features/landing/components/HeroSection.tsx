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
        <section className="landing-hero-gradient relative min-h-[70dvh] flex items-center justify-center px-6 pt-32 pb-20">
            <div className="mx-auto max-w-5xl text-center">
                <h1
                    className="animate-fade-in-up mb-6 text-[clamp(2.25rem,5vw,4.5rem)] font-bold leading-[1.05] tracking-tight text-balance"
                    style={staggerStyle(1)}
                >
                    {t('hero.title.line1')}{' '}
                    <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                        {t('hero.title.accent')}
                    </span>
                    <br className="hidden sm:block" /> {t('hero.title.line2')}
                </h1>
                <p
                    className="animate-fade-in-up mx-auto mb-10 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
                    style={staggerStyle(2)}
                >
                    {t('hero.subtitle')}
                </p>
                <div
                    className="animate-fade-in-up flex flex-col items-center justify-center gap-3 sm:flex-row"
                    style={staggerStyle(3)}
                >
                    <Button
                        size="lg"
                        className="w-full rounded-xl px-8 text-sm font-semibold sm:w-auto"
                        onClick={handleStart}
                    >
                        {t('hero.cta_primary')}
                    </Button>
                    <Button
                        variant="outline"
                        size="lg"
                        className="w-full gap-2 rounded-xl px-8 text-sm font-medium sm:w-auto"
                        onClick={handleExplore}
                    >
                        <Globe size={16} />
                        {t('hero.cta_explore')}
                    </Button>
                </div>
            </div>
        </section>
    );
};
