import { useTranslation } from 'react-i18next';

import { ArrowRight } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { gradientOf, initialsOf } from '@flows/shared';
import { Badge } from '@flows/ui-kit';

import type { AppView } from '@flows/flows';

export const AppCard = ({ app }: { app: AppView }) => {
    const { t, i18n } = useTranslation();
    const title = app.name || app.code;
    const timestamp = app.deployedAt ?? app.updatedAt;
    const isDeployed = app.status === 'deployed';

    return (
        <a
            /**
             * A plain <a>, not a react-router <Link>: `/apps/:id` is served by CloudFront
             * (→ eureka-flows-api → the App's own S3 bundle), not by this SPA, so the click must
             * be a real navigation that leaves the SPA.
             *
             * The href is relative so it resolves against whatever origin serves the page — the
             * DEV deploy serves DEV Apps, PROD serves PROD ones. Caveat: on `localhost` there is
             * no CloudFront, so this lands on the SPA catch-all (404). That is expected; verify
             * App links on a deployed environment.
             *
             * @see docs/adr/0003-apps-route-ownership.md
             */
            href={`/apps/${app.id}`}
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
                    <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/30 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
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
