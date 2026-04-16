import { useTranslation } from 'react-i18next';

import { BrainCircuit, LayoutGrid, Zap } from 'lucide-react';

import { useInView } from '../hooks';

import type { LucideIcon } from 'lucide-react';

const FEATURES: { key: string; Icon: LucideIcon; accent: string }[] = [
    { key: 'visual_canvas', Icon: LayoutGrid, accent: 'text-emerald-500' },
    { key: 'ai_nodes', Icon: BrainCircuit, accent: 'text-primary' },
    { key: 'instant_run', Icon: Zap, accent: 'text-amber-500' },
];

export const FeaturesSection = () => {
    const { t } = useTranslation('landing');
    const { ref, isInView } = useInView();

    return (
        <section className="border-t border-border/40 py-20">
            <div className="mx-auto max-w-[1200px] px-6">
                <div
                    ref={ref}
                    className={`mb-14 text-center transition-all duration-700 ${
                        isInView ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
                    }`}
                >
                    <h2 className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl">{t('features.title')}</h2>
                    <p className="mx-auto max-w-lg text-sm text-muted-foreground">{t('features.subtitle')}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {FEATURES.map(({ key, Icon, accent }, index) => (
                        <FeatureCard key={key} featureKey={key} Icon={Icon} accent={accent} index={index} />
                    ))}
                </div>
            </div>
        </section>
    );
};

const FeatureCard = ({
    featureKey,
    Icon,
    accent,
    index,
}: {
    featureKey: string;
    Icon: LucideIcon;
    accent: string;
    index: number;
}) => {
    const { t } = useTranslation('landing');
    const { ref, isInView } = useInView();

    return (
        <div
            ref={ref}
            className={`rounded-xl border border-border/30 bg-card/30 p-6 transition-all duration-700 ${
                isInView ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
            }`}
            style={{ transitionDelay: `${index * 100}ms` }}
        >
            <div className={`mb-4 ${accent}`}>
                <Icon size={28} strokeWidth={1.5} />
            </div>
            <h3 className="mb-1.5 text-base font-semibold">{t(`features.${featureKey}.title`)}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{t(`features.${featureKey}.description`)}</p>
        </div>
    );
};
