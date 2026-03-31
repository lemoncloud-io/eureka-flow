import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Button } from '@flows/ui-kit';

import { ROUTES } from '../consts';
import { useInView } from '../hooks';

export const CtaSection = () => {
    const navigate = useNavigate();
    const { t } = useTranslation('landing');
    const { ref, isInView } = useInView();

    const handleStart = () => navigate(ROUTES.EDITOR);

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
                <Button size="lg" onClick={handleStart} className="transition-transform hover:scale-105">
                    {t('cta.button')}
                </Button>
            </div>
        </section>
    );
};
