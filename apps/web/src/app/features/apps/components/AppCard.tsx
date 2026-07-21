import { useTranslation } from 'react-i18next';

import { ArrowUpRight } from 'lucide-react';

import { cn } from '@flows/lib/utils';

import { deriveAppIdentity } from '../utils';

import type { AppSeoMeta } from '@flows/flows';

export const AppCard = ({ app }: { app: AppSeoMeta }) => {
    const { i18n } = useTranslation();
    const { slug, name } = deriveAppIdentity(app);

    // A gallery card's only job is to open the App; without the server-provided url there is
    // nothing to open, so drop the card rather than render a dead, non-navigable tile.
    if (!app.url) return null;

    const updated = app.lastmod
        ? new Date(app.lastmod).toLocaleDateString(i18n.language, { year: 'numeric', month: 'short', day: 'numeric' })
        : null;

    return (
        <a
            /**
             * A plain <a>, not a react-router <Link>: an App is a separate deployment served at its
             * own URL, not by this SPA, so the click must be a real navigation that leaves the SPA.
             * `app.url` is the server-provided canonical URL (environment-correct) — used verbatim.
             *
             * @see docs/adr/0003-apps-route-ownership.md
             */
            href={app.url}
            className={cn(
                'group relative flex flex-col overflow-hidden rounded-2xl border border-border/50 bg-card',
                'transition duration-300 ease-out hover:-translate-y-1 hover:border-primary/40',
                'hover:shadow-xl hover:shadow-primary/10'
            )}
        >
            {/* Thumbnail cover: the App's screenshot, clean. Its name — below — is the title. */}
            <div className="relative aspect-[16/10] overflow-hidden bg-muted/30">
                {app.image && (
                    <img
                        src={app.image}
                        alt=""
                        aria-hidden="true"
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                    />
                )}

                <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-border/40 bg-background/70 text-foreground opacity-0 backdrop-blur-md transition-opacity duration-300 group-hover:opacity-100">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
            </div>

            <div className="flex flex-1 flex-col p-4">
                <h3 className="truncate text-base font-semibold tracking-tight">{name}</h3>
                <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{slug}</p>
                {updated && (
                    <p className="mt-3 border-t border-border/40 pt-2.5 text-[11px] text-muted-foreground/70">
                        {updated}
                    </p>
                )}
            </div>
        </a>
    );
};
