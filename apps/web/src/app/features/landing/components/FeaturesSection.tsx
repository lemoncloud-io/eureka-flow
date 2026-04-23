import { useTranslation } from 'react-i18next';

import { BrainCircuit, LayoutGrid, Zap } from 'lucide-react';

import { cn } from '@flows/lib/utils';

import { useInView } from '../hooks';

import type { LucideIcon } from 'lucide-react';

const STAGGER_MS = 120;

const FEATURES: { key: string; Icon: LucideIcon; tall?: boolean }[] = [
    { key: 'visual_canvas', Icon: LayoutGrid, tall: true },
    { key: 'ai_nodes', Icon: BrainCircuit },
    { key: 'instant_run', Icon: Zap },
];

export const FeaturesSection = () => {
    const { t } = useTranslation('landing');
    const { ref, isInView } = useInView();

    return (
        <section className="py-28 sm:py-36">
            <div className="mx-auto max-w-[1100px] px-6">
                <div
                    ref={ref}
                    className={cn(
                        'mb-16 text-center transition-all duration-700',
                        isInView ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
                    )}
                >
                    <h2 className="mb-3 text-2xl font-bold tracking-tight sm:text-3xl">{t('features.title')}</h2>
                    <p className="mx-auto max-w-md text-sm text-muted-foreground sm:text-base">
                        {t('features.subtitle')}
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:grid-rows-2">
                    {FEATURES.map(({ key, Icon, tall }, index) => (
                        <FeatureCard key={key} featureKey={key} Icon={Icon} tall={tall} index={index} />
                    ))}
                </div>
            </div>
        </section>
    );
};

const FeatureCard = ({
    featureKey,
    Icon,
    tall,
    index,
}: {
    featureKey: string;
    Icon: LucideIcon;
    tall?: boolean;
    index: number;
}) => {
    const { t } = useTranslation('landing');
    const { ref, isInView } = useInView();

    return (
        <div
            ref={ref}
            className={cn(
                'landing-card group rounded-2xl border border-border/30 bg-card/40 p-7 sm:p-8 transition-all duration-700',
                tall && 'md:row-span-2 flex flex-col justify-center',
                isInView ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
            )}
            style={{ transitionDelay: `${index * STAGGER_MS}ms` }}
        >
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors duration-300 group-hover:bg-primary/15">
                <Icon size={24} strokeWidth={1.5} />
            </div>
            <h3 className="mb-2 text-lg font-semibold tracking-tight">{t(`features.${featureKey}.title`)}</h3>
            <p className={cn('text-sm leading-relaxed text-muted-foreground', tall && 'max-w-sm')}>
                {t(`features.${featureKey}.description`)}
            </p>
        </div>
    );
};
