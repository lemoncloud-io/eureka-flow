import { useTranslation } from 'react-i18next';

import { ExternalLink } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { SITE_URL } from '@flows/shared';
import { Badge } from '@flows/ui-kit';

import type { AppView } from '@flows/flows';

/**
 * Apps have no per-App preview image, so the tile is a deterministic gradient
 * derived from the App's code — stable across renders, distinct per App.
 */
const GRADIENTS = [
    'from-violet-500/25 to-fuchsia-500/10',
    'from-sky-500/25 to-cyan-500/10',
    'from-amber-500/25 to-orange-500/10',
    'from-emerald-500/25 to-teal-500/10',
    'from-rose-500/25 to-pink-500/10',
    'from-indigo-500/25 to-blue-500/10',
];

const gradientOf = (code: string): string => {
    let hash = 0;
    for (let i = 0; i < code.length; i++) hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
    return GRADIENTS[hash % GRADIENTS.length];
};

const initialsOf = (label: string): string =>
    label
        .split(/[\s-_]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part.charAt(0).toUpperCase())
        .join('');

export const AppCard = ({ app }: { app: AppView }) => {
    const { t, i18n } = useTranslation();
    const title = app.name || app.code;
    const timestamp = app.deployedAt ?? app.updatedAt;
    const isDeployed = app.status === 'deployed';

    return (
        <a
            /**
             * `/apps/:id` is served by CloudFront (→ eureka-flows-api → the App's own S3 bundle),
             * not by this SPA. The absolute SITE_URL is deliberate: a relative href would hit the
             * SPA catch-all on localhost, where CloudFront does not exist.
             *
             * SITE_URL is PROD. That is correct only while the ids come from the PROD-id mock —
             * once the real list endpoint ships and returns DEV ids on DEV, switch to a relative
             * href (works on any CloudFront-backed deploy) or an env-aware base.
             *
             * @see docs/adr/0003-apps-route-ownership.md
             */
            href={`${SITE_URL}/apps/${app.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
                'group flex flex-col overflow-hidden rounded-2xl border border-border/40 bg-card',
                'transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5'
            )}
        >
            <div
                className={cn('flex aspect-[16/9] items-center justify-center bg-gradient-to-br', gradientOf(app.code))}
            >
                <span className="text-3xl font-bold tracking-tight text-foreground/40">{initialsOf(title)}</span>
            </div>

            <div className="flex flex-1 flex-col gap-1.5 p-4">
                <div className="flex items-start justify-between gap-2">
                    <h3 className="line-clamp-1 text-sm font-medium">{title}</h3>
                    <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-primary" />
                </div>
                <p className="line-clamp-1 font-mono text-[11px] text-muted-foreground/60">{app.code}</p>
                <div className="mt-1 flex items-center gap-2">
                    {app.status && (
                        <Badge variant={isDeployed ? 'default' : 'secondary'} className="text-[10px]">
                            {t(`apps.status.${app.status}`, app.status)}
                        </Badge>
                    )}
                    {timestamp && (
                        <span className="ml-auto text-[11px] text-muted-foreground/50">
                            {new Date(timestamp).toLocaleDateString(i18n.language)}
                        </span>
                    )}
                </div>
            </div>
        </a>
    );
};
