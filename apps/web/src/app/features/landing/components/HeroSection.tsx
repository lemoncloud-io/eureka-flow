import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Globe } from 'lucide-react';

import { Button } from '@flows/ui-kit';

import { ROUTES, staggerStyle } from '../consts';

export const HeroSection = () => {
    const navigate = useNavigate();
    const { t } = useTranslation('landing');

    const handleStart = () => navigate(ROUTES.EDITOR);
    const handleExplore = () => navigate(ROUTES.EXPLORE);

    return (
        <section className="relative mx-auto max-w-4xl px-6 pt-40 pb-20 text-center">
            {/* Subtle glow behind hero */}
            <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/[0.04] rounded-full blur-[120px] pointer-events-none" />
            <h1
                className="animate-fade-in-up mb-6 text-[clamp(2.5rem,5.5vw,4.5rem)] font-bold leading-[1.1] tracking-tight"
                style={staggerStyle(1)}
            >
                {t('hero.title.line1')}
                <br />
                <span className="bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
                    {t('hero.title.accent')}
                </span>
                <br />
                {t('hero.title.line2')}
            </h1>
            <p
                className="animate-fade-in-up mx-auto mb-10 max-w-xl text-lg leading-relaxed text-muted-foreground"
                style={staggerStyle(2)}
            >
                {t('hero.subtitle')}
            </p>
            <div
                className="animate-fade-in-up flex flex-col items-center justify-center gap-3 px-4 sm:flex-row sm:gap-4 sm:px-0"
                style={staggerStyle(3)}
            >
                <Button size="lg" className="w-full sm:w-auto" onClick={handleStart}>
                    {t('hero.cta_primary')}
                </Button>
                <Button variant="outline" size="lg" className="w-full gap-2 sm:w-auto" onClick={handleExplore}>
                    <Globe size={16} />
                    {t('hero.cta_explore', 'Explore Public Flows')}
                </Button>
            </div>
        </section>
    );
};
