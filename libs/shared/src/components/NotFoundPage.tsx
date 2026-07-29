import { useTranslation } from 'react-i18next';

import { ArrowRight, FileQuestion, Globe } from 'lucide-react';

import { Button } from '@flows/ui-kit';

import { ERROR_MESSAGE_KEYS } from '../consts';

import type { CSSProperties, ReactElement } from 'react';

const STAGGER_DELAY_MS = 80;
const staggerStyle = (index: number): CSSProperties => ({
    animationDelay: `${STAGGER_DELAY_MS * index}ms`,
    opacity: 0,
});

/**
 * Full-screen 404 page for unmatched routes
 * Rendered by the router's catch-all route
 */
export const NotFoundPage = (): ReactElement => {
    const { t } = useTranslation(['common', 'flows']);
    const messageKeys = ERROR_MESSAGE_KEYS.notFound;

    const handleGoHome = (): void => {
        window.location.href = '/';
    };

    const handleGoBack = (): void => {
        window.history.back();
    };

    return (
        <div className="flex h-screen bg-background text-foreground font-sans items-center justify-center flex-col gap-4">
            <div className="flex flex-col items-center max-w-sm mx-auto px-4">
                {/* Icon */}
                <div className="animate-fade-in-up" style={staggerStyle(0)}>
                    <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border/40 flex items-center justify-center mb-5">
                        <FileQuestion className="w-7 h-7 text-muted-foreground/50" />
                    </div>
                </div>

                {/* Title */}
                <h2
                    className="text-base font-semibold text-foreground mb-1.5 text-center animate-fade-in-up"
                    style={staggerStyle(1)}
                >
                    {t(messageKeys.title)}
                </h2>

                {/* Description */}
                <p
                    className="text-sm text-muted-foreground text-center mb-6 leading-relaxed animate-fade-in-up"
                    style={staggerStyle(2)}
                >
                    {t(messageKeys.description)}
                </p>

                {/* Actions */}
                <div className="flex flex-col items-center gap-2.5 animate-fade-in-up" style={staggerStyle(3)}>
                    <div className="flex gap-2">
                        <Button size="sm" onClick={handleGoHome}>
                            {t(messageKeys.primaryAction)}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleGoBack}>
                            {t(messageKeys.secondaryAction)}
                        </Button>
                    </div>
                    <a
                        href="/flows"
                        className="group flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-primary transition-colors mt-1"
                    >
                        <Globe className="w-3.5 h-3.5" />
                        {t('flows:flowEditor.browsePublicFlows', 'Browse public flows')}
                        <ArrowRight className="w-3 h-3 -translate-x-0.5 group-hover:translate-x-0 transition-transform" />
                    </a>
                </div>
            </div>
        </div>
    );
};
