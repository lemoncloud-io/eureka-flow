import { useTranslation } from 'react-i18next';

import { BrainCircuit, LayoutGrid, Zap } from 'lucide-react';

import { Badge } from '@flows/ui-kit';

import { useInView } from '../hooks';

import type { LucideIcon } from 'lucide-react';

const FEATURE_ICON_SIZE = 64;

const FEATURES: { key: string; Icon: LucideIcon; gradient: string }[] = [
    { key: 'visual_canvas', Icon: LayoutGrid, gradient: 'from-emerald-500/20 to-teal-500/20' },
    { key: 'ai_nodes', Icon: BrainCircuit, gradient: 'from-primary/20 to-purple-500/20' },
    { key: 'instant_run', Icon: Zap, gradient: 'from-amber-500/20 to-orange-500/20' },
];

const FeatureItem = ({
    featureKey,
    Icon,
    gradient,
    index,
}: {
    featureKey: string;
    Icon: LucideIcon;
    gradient: string;
    index: number;
}) => {
    const { t } = useTranslation('landing');
    const { ref, isInView } = useInView();
    const isReversed = index % 2 === 1;

    return (
        <div
            ref={ref}
            className={`flex flex-col items-center gap-8 md:gap-12 ${
                isReversed ? 'md:flex-row-reverse' : 'md:flex-row'
            } transition-all duration-700 ${isInView ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}
        >
            <div className="flex w-full flex-1 items-center justify-center">
                <div
                    className={`flex aspect-[4/3] w-full max-w-sm items-center justify-center rounded-2xl bg-gradient-to-br ${gradient} border border-border/50`}
                >
                    <Icon size={FEATURE_ICON_SIZE} className="text-foreground/20" />
                </div>
            </div>

            <div className="flex-1 text-center md:text-left">
                <h3 className="mb-3 text-2xl font-bold">{t(`features.${featureKey}.title`)}</h3>
                <p className="leading-relaxed text-muted-foreground">{t(`features.${featureKey}.description`)}</p>
            </div>
        </div>
    );
};

export const FeaturesSection = () => {
    const { t } = useTranslation('landing');
    const { ref, isInView } = useInView();

    return (
        <section className="border-t border-border bg-muted/30 py-24">
            <div className="mx-auto max-w-5xl px-6">
                <div
                    ref={ref}
                    className={`mb-16 text-center transition-all duration-700 ${
                        isInView ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
                    }`}
                >
                    <Badge className="mb-4">{t('features.badge')}</Badge>
                    <h2 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">{t('features.title')}</h2>
                    <p className="mx-auto max-w-2xl text-muted-foreground">{t('features.subtitle')}</p>
                </div>

                <div className="flex flex-col gap-20">
                    {FEATURES.map(({ key, Icon, gradient }, index) => (
                        <FeatureItem key={key} featureKey={key} Icon={Icon} gradient={gradient} index={index} />
                    ))}
                </div>
            </div>
        </section>
    );
};
