import { useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { Github, Loader2 } from 'lucide-react';

import { useAppsListInfiniteQuery } from '@flows/flows';
import { GITHUB_URL } from '@flows/shared';
import { Badge, Button, LanguageSwitcher, ThemeToggle } from '@flows/ui-kit';

import { AppCard, AppsEmptyState, AppsErrorState, AppsMockToggle } from '../components';

const SKELETON_COUNT = 4;

const AppsHeader = () => {
    const { t } = useTranslation(['flows']);
    const navigate = useNavigate();

    return (
        <nav className="fixed top-0 right-0 left-0 z-50 flex justify-center px-4 pt-4">
            <div className="flex w-full max-w-[1200px] items-center justify-between rounded-2xl border border-border/40 bg-background/70 px-4 py-2 backdrop-blur-2xl">
                <div className="flex items-center gap-2.5">
                    <Link to="/" className="flex items-center gap-2 transition-opacity hover:opacity-70">
                        <img
                            src="/logo/purple-symbol.png"
                            alt="Eureka Flow"
                            className="h-6 w-6"
                            width={24}
                            height={24}
                        />
                        <span className="hidden text-sm font-semibold tracking-tight sm:inline">Eureka Flow</span>
                    </Link>
                    <Badge className="pulse-soft text-[10px]">Open Beta</Badge>
                </div>

                <div className="flex items-center gap-0.5">
                    <Button variant="ghost" size="icon" className="hidden h-8 w-8 sm:inline-flex" asChild>
                        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label="GitHub">
                            <Github size={15} />
                        </a>
                    </Button>
                    <LanguageSwitcher />
                    <ThemeToggle />
                    <Button
                        size="sm"
                        className="ml-1 h-8 rounded-xl text-xs font-medium"
                        onClick={() => navigate('/editor')}
                    >
                        {t('flows:publicFlows.goToEditor', 'Go to Editor')}
                    </Button>
                </div>
            </div>
        </nav>
    );
};

/**
 * Public gallery of every deployed App, from the SEO list endpoint.
 *
 * `/apps` IS a public route (see `isPublicRoute()` in providers.tsx): it renders for
 * signed-out visitors and is indexable. Its data comes from the unauthenticated SEO
 * list, so there is no API key or workspace scope here.
 */
export const AppsPage = () => {
    const { t } = useTranslation();
    const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
        useAppsListInfiniteQuery();
    const apps = data?.pages.flatMap(page => page.list) ?? [];
    const total = data?.pages[0]?.total ?? apps.length;

    // Infinite scroll: fetch the next page when the sentinel scrolls into view. A ref mirror lets
    // the observer callback read fresh query state without re-subscribing on every render.
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const scrollStateRef = useRef({ hasNextPage, isFetchingNextPage, fetchNextPage });
    scrollStateRef.current = { hasNextPage, isFetchingNextPage, fetchNextPage };

    useEffect(() => {
        const el = loadMoreRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            entries => {
                const { hasNextPage: has, isFetchingNextPage: fetching, fetchNextPage: fetch } = scrollStateRef.current;
                if (entries[0]?.isIntersecting && has && !fetching) fetch();
            },
            { threshold: 0.1 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [isLoading]);

    const renderBody = () => {
        if (isLoading) {
            return (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                        <div key={i} className="h-56 animate-pulse rounded-2xl bg-muted/30" />
                    ))}
                </div>
            );
        }

        if (isError) return <AppsErrorState onRetry={() => refetch()} />;

        if (apps.length === 0) return <AppsEmptyState />;

        return (
            <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {apps.map(app => (
                        <AppCard key={app.id ?? app.url} app={app} />
                    ))}
                </div>
                <div ref={loadMoreRef} className="flex justify-center py-10">
                    {isFetchingNextPage && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />}
                </div>
            </>
        );
    };

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Helmet>
                <title>{t('apps.title', 'Apps')}</title>
                <meta name="description" content={t('apps.description', 'Explore apps built on Eureka Flow.')} />
            </Helmet>

            <AppsHeader />

            <section className="mx-auto max-w-[1200px] px-6 pb-8 pt-28">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                        {t('apps.title', 'Apps built on Eureka Flow')}
                    </h1>
                    {total > 0 && (
                        <span className="rounded-full border border-border/50 px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
                            {t('apps.live', '{{count}} live', { count: total })}
                        </span>
                    )}
                </div>
                <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                    {t('apps.description', 'Live AI web apps, built visually. Open one to try it.')}
                </p>
            </section>

            <main className="mx-auto max-w-[1200px] px-6 pb-20">{renderBody()}</main>

            {import.meta.env.DEV && <AppsMockToggle />}
        </div>
    );
};
