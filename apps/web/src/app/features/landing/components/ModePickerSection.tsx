import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { ArrowRight, Blocks, Check, Compass } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { Button, Card, CardContent } from '@flows/ui-kit';

import { ROUTES } from '../consts';
import { useInView, useLandingContext, useStartNavigation } from '../hooks';

import type { LucideIcon } from 'lucide-react';

interface ModeCardProps {
    icon: LucideIcon;
    title: string;
    subtitle: string;
    description: string;
    features: string[];
    cta: string;
    onAction: () => void;
    variant: 'primary' | 'secondary';
    isInView: boolean;
    delay: number;
}

const ModeCard = ({
    icon: Icon,
    title,
    subtitle,
    description,
    features,
    cta,
    onAction,
    variant,
    isInView,
    delay,
}: ModeCardProps) => {
    const isPrimary = variant === 'primary';

    return (
        <Card
            className={cn(
                'group relative overflow-hidden border-2 transition-all duration-500',
                isPrimary
                    ? 'border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-primary/[0.02] hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5'
                    : 'border-border/40 hover:border-border/80 hover:shadow-lg',
                isInView ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
            )}
            style={{ transitionDelay: `${delay}ms` }}
        >
            <CardContent className="flex h-full flex-col gap-5 p-6 sm:p-8">
                <div className="flex items-center gap-3">
                    <div
                        className={cn(
                            'flex h-11 w-11 items-center justify-center rounded-xl transition-colors duration-200',
                            isPrimary ? 'bg-primary/10 group-hover:bg-primary/15' : 'bg-muted group-hover:bg-muted/80'
                        )}
                    >
                        <Icon className={cn('h-5 w-5', isPrimary ? 'text-primary' : 'text-foreground')} />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold tracking-tight">{title}</h3>
                        <p className="text-sm text-muted-foreground">{subtitle}</p>
                    </div>
                </div>

                <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>

                <ul className="space-y-2.5">
                    {features.map((feature: string) => (
                        <li key={feature} className="flex items-center gap-2.5 text-sm">
                            <Check
                                className={cn('h-4 w-4 shrink-0', isPrimary ? 'text-primary' : 'text-muted-foreground')}
                            />
                            <span>{feature}</span>
                        </li>
                    ))}
                </ul>

                <Button
                    variant={isPrimary ? 'default' : 'outline'}
                    size="lg"
                    className="mt-auto w-full gap-2 rounded-xl text-sm font-semibold"
                    onClick={onAction}
                >
                    {cta}
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Button>
            </CardContent>
        </Card>
    );
};

export const ModePickerSection = () => {
    const { t } = useTranslation('landing');
    const navigate = useNavigate();
    const { ref, isInView } = useInView();
    const handleStartNavigating = useStartNavigation();
    const { isAuthenticated, urgentAction } = useLandingContext();

    const navigatorSubtitle = urgentAction
        ? `${urgentAction.item.name} · ${urgentAction.action.stage.name}`
        : t('mode_picker.navigator.subtitle');

    const navigatorCta = urgentAction
        ? `${t('mode_picker.navigator.continue', 'Continue')}: ${urgentAction.action.stage.name}`
        : isAuthenticated
          ? t('mode_picker.navigator.goToDashboard', 'Go to Dashboard')
          : t('mode_picker.navigator.cta');

    const handleNavigatorAction = () => {
        if (urgentAction) {
            navigate(`/items/${urgentAction.item.id}/stages/${urgentAction.action.stage.id}`);
        } else {
            handleStartNavigating();
        }
    };

    return (
        <section ref={ref} className="relative px-6 py-12 sm:py-20">
            <div className="mx-auto max-w-4xl">
                <div className="grid gap-5 sm:grid-cols-2 sm:gap-6">
                    <ModeCard
                        icon={Compass}
                        title={t('mode_picker.navigator.title')}
                        subtitle={navigatorSubtitle}
                        description={t('mode_picker.navigator.description')}
                        features={t('mode_picker.navigator.features', { returnObjects: true }) as string[]}
                        cta={navigatorCta}
                        onAction={handleNavigatorAction}
                        variant="primary"
                        isInView={isInView}
                        delay={0}
                    />
                    <ModeCard
                        icon={Blocks}
                        title={t('mode_picker.builder.title')}
                        subtitle={t('mode_picker.builder.subtitle')}
                        description={t('mode_picker.builder.description')}
                        features={t('mode_picker.builder.features', { returnObjects: true }) as string[]}
                        cta={t('mode_picker.builder.cta')}
                        onAction={() => navigate(ROUTES.EXPLORE)}
                        variant="secondary"
                        isInView={isInView}
                        delay={150}
                    />
                </div>
            </div>
        </section>
    );
};
