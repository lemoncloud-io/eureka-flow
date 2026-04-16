import { useTranslation } from 'react-i18next';

import { Cable, Play, Plus } from 'lucide-react';

import { useInView } from '../hooks';

import type { LucideIcon } from 'lucide-react';

const STEP_STAGGER_MS = 120;

const STEPS: { key: string; Icon: LucideIcon; accent: string }[] = [
    { key: 'add_blocks', Icon: Plus, accent: 'text-emerald-500 bg-emerald-500/10' },
    { key: 'connect_flow', Icon: Cable, accent: 'text-primary bg-primary/10' },
    { key: 'run_iterate', Icon: Play, accent: 'text-amber-500 bg-amber-500/10' },
];

export const HowItWorksSection = () => {
    const { t } = useTranslation('landing');
    const { ref, isInView } = useInView();

    return (
        <section ref={ref} className="py-20">
            <div className="mx-auto max-w-[1200px] px-6 text-center">
                <h2 className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl">{t('how_it_works.title')}</h2>
                <p className="mx-auto mb-14 max-w-lg text-sm text-muted-foreground">{t('how_it_works.subtitle')}</p>

                <div className="flex flex-col items-center gap-8 md:flex-row md:gap-4">
                    {STEPS.map(({ key, Icon, accent }, index) => (
                        <div
                            key={key}
                            className={`flex flex-1 flex-col items-center gap-3 transition-all duration-700 ${
                                isInView ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
                            }`}
                            style={{ transitionDelay: `${index * STEP_STAGGER_MS}ms` }}
                        >
                            <div className="relative">
                                <span className="absolute -top-1.5 -left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                                    {index + 1}
                                </span>
                                <div className={`flex h-14 w-14 items-center justify-center rounded-xl ${accent}`}>
                                    <Icon size={24} />
                                </div>
                            </div>
                            <div className="text-center">
                                <h3 className="mb-1 text-sm font-semibold">{t(`how_it_works.${key}.title`)}</h3>
                                <p className="max-w-[220px] text-xs leading-relaxed text-muted-foreground">
                                    {t(`how_it_works.${key}.description`)}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};
