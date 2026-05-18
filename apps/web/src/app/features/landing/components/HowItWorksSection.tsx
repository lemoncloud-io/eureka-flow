import { useTranslation } from 'react-i18next';

import { Cable, Play, Plus } from 'lucide-react';

import { useInView } from '../hooks';

import type { LucideIcon } from 'lucide-react';

const STAGGER_MS = 150;

const STEPS: { key: string; Icon: LucideIcon }[] = [
    { key: 'add_blocks', Icon: Plus },
    { key: 'connect_flow', Icon: Cable },
    { key: 'run_iterate', Icon: Play },
];

export const HowItWorksSection = () => {
    const { t } = useTranslation('landing');
    const { ref, isInView } = useInView();

    return (
        <section ref={ref} className="py-28 sm:py-36">
            <div className="mx-auto max-w-4xl px-6">
                <div
                    className={`mb-16 text-center transition-all duration-700 ${
                        isInView ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
                    }`}
                >
                    <h2 className="mb-3 text-2xl font-bold tracking-tight sm:text-3xl">{t('how_it_works.title')}</h2>
                    <p className="mx-auto max-w-md text-sm text-muted-foreground sm:text-base">
                        {t('how_it_works.subtitle')}
                    </p>
                </div>

                <div className="relative">
                    {/* Connecting line */}
                    <div className="absolute top-8 right-12 left-12 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block" />

                    <div className="grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-8">
                        {STEPS.map(({ key, Icon }, index) => (
                            <div
                                key={key}
                                className={`relative flex flex-col items-center text-center transition-all duration-700 ${
                                    isInView ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
                                }`}
                                style={{ transitionDelay: `${index * STAGGER_MS}ms` }}
                            >
                                <div className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-border/40 bg-card text-primary shadow-sm">
                                    <Icon size={24} strokeWidth={1.5} />
                                    <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground shadow-sm">
                                        {index + 1}
                                    </span>
                                </div>
                                <h3 className="mb-1.5 text-base font-semibold">{t(`how_it_works.${key}.title`)}</h3>
                                <p className="max-w-[260px] text-sm leading-relaxed text-muted-foreground">
                                    {t(`how_it_works.${key}.description`)}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};
