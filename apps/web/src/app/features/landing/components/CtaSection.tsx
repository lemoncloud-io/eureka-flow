import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Globe } from 'lucide-react';

import { Button } from '@flows/ui-kit';

import { ROUTES } from '../consts';
import { useInView } from '../hooks';

export const CtaSection = () => {
    const navigate = useNavigate();
    const { t } = useTranslation('landing');
    const { ref, isInView } = useInView();

    const handleStart = () => navigate(ROUTES.EDITOR);
    const handleExplore = () => navigate(ROUTES.EXPLORE);

    return (
        <section ref={ref} className="relative overflow-hidden border-t border-border py-24 text-center">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />

            <div
                className={`relative mx-auto max-w-2xl px-6 transition-all duration-700 ${
                    isInView ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
                }`}
            >
                <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">{t('cta.title')}</h2>
                <p className="mb-4 text-lg text-muted-foreground">{t('cta.subtitle')}</p>
                <p className="mb-8 text-sm text-muted-foreground/70">{t('cta.note')}</p>
                <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
                    <Button size="lg" onClick={handleStart} className="transition-transform hover:scale-105">
                        {t('cta.button')}
                    </Button>
                    <Button
                        variant="outline"
                        size="lg"
                        className="gap-2 transition-transform hover:scale-105"
                        onClick={handleExplore}
                    >
                        <Globe size={16} />
                        {t('cta.explore', 'Explore Public Flows')}
                    </Button>
                </div>
            </div>
        </section>
    );
};
