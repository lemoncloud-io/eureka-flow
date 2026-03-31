import { useTranslation } from 'react-i18next';

import { Cable, Play, Plus } from 'lucide-react';

import { Badge } from '@flows/ui-kit';

import { useInView } from '../hooks';

import type { LucideIcon } from 'lucide-react';

const ICON_SIZE = 28;
const STEP_STAGGER_MS = 150;

const STEPS: { key: string; Icon: LucideIcon; color: string }[] = [
    { key: 'add_blocks', Icon: Plus, color: 'text-emerald-500 bg-emerald-500/10' },
    { key: 'connect_flow', Icon: Cable, color: 'text-primary bg-primary/10' },
    { key: 'run_iterate', Icon: Play, color: 'text-amber-500 bg-amber-500/10' },
];

export const HowItWorksSection = () => {
    const { t } = useTranslation('landing');
    const { ref, isInView } = useInView();

    return (
        <section ref={ref} className="py-24">
            <div className="mx-auto max-w-5xl px-6 text-center">
                <Badge className="mb-4">{t('how_it_works.badge')}</Badge>
                <h2 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">{t('how_it_works.title')}</h2>
                <p className="mx-auto mb-16 max-w-2xl text-muted-foreground">{t('how_it_works.subtitle')}</p>

                <div className="flex flex-col items-center gap-8 md:flex-row md:gap-4">
                    {STEPS.map(({ key, Icon, color }, index) => (
                        <div
                            key={key}
                            className={`flex flex-1 flex-col items-center gap-4 transition-all duration-700 ${
                                isInView ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
                            }`}
                            style={{ transitionDelay: `${index * STEP_STAGGER_MS}ms` }}
                        >
                            <div className="relative">
                                <span className="absolute -top-2 -left-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                                    {index + 1}
                                </span>
                                <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${color}`}>
                                    <Icon size={ICON_SIZE} />
                                </div>
                            </div>
                            <div className="text-center">
                                <h3 className="mb-1 text-lg font-semibold">{t(`how_it_works.${key}.title`)}</h3>
                                <p className="max-w-[240px] text-sm leading-relaxed text-muted-foreground">
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
