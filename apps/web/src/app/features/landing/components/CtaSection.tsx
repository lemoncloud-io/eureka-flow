import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Globe } from 'lucide-react';

import { Button } from '@flows/ui-kit';

import { ROUTES } from '../consts';
import { useInView } from '../hooks';
import { shouldShowTutorial } from '../utils';

export const CtaSection = () => {
    const navigate = useNavigate();
    const { t } = useTranslation('landing');
    const { ref, isInView } = useInView();

    const handleStart = () => navigate(shouldShowTutorial() ? ROUTES.TUTORIAL : ROUTES.EDITOR);
    const handleExplore = () => navigate(ROUTES.EXPLORE);

    return (
        <section ref={ref} className="border-t border-border/40 py-20 text-center">
            <div
                className={`relative mx-auto max-w-xl px-6 transition-all duration-700 ${
                    isInView ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
                }`}
            >
                <h2 className="mb-3 text-2xl font-bold tracking-tight sm:text-3xl">{t('cta.title')}</h2>
                <p className="mb-3 text-sm text-muted-foreground">{t('cta.subtitle')}</p>
                <p className="mb-6 text-xs text-muted-foreground/60">{t('cta.note')}</p>
                <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
                    <Button size="lg" onClick={handleStart}>
                        {t('cta.button')}
                    </Button>
                    <Button variant="outline" size="lg" className="gap-2" onClick={handleExplore}>
                        <Globe size={16} />
                        {t('cta.explore', 'Explore Public Flows')}
                    </Button>
                </div>
            </div>
        </section>
    );
};
