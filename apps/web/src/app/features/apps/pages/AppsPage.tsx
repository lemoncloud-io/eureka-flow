import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { ArrowDownUp, Github, Loader2, Search } from 'lucide-react';

import { useAppsListInfiniteQuery } from '@flows/flows';
import { GITHUB_URL, useInfiniteScrollObserver } from '@flows/shared';
import { Badge, Button, Input, LanguageSwitcher, ThemeToggle } from '@flows/ui-kit';

import { AppCard, AppsEmptyState, AppsErrorState, AppsMockToggle } from '../components';

const SKELETON_COUNT = 8;
const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

/** Loading placeholder shaped like a real `AppCard` (cover + two text lines) — no layout jump. */
const SkeletonCard = () => (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
        <div className="aspect-[16/10] animate-pulse bg-muted/40" />
        <div className="space-y-2 p-4">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted/40" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted/30" />
        </div>
    </div>
);

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

    const flatApps = useMemo(() => data?.pages.flatMap(page => page.list) ?? [], [data]);
    const total = data?.pages[0]?.total ?? flatApps.length;

    const [query, setQuery] = useState('');
    const [sortDir, setSortDir] = useState<'newest' | 'oldest'>('newest');

    // Search + sort run client-side over the loaded pages (server sort contract is unconfirmed).
    const apps = useMemo(() => {
        const q = query.trim().toLowerCase();
        const filtered = q
            ? flatApps.filter(app => `${app.title} ${app.description}`.toLowerCase().includes(q))
            : flatApps;
        const sorted = [...filtered].sort((a, b) => (b.lastmod ?? 0) - (a.lastmod ?? 0));
        return sortDir === 'oldest' ? sorted.reverse() : sorted;
    }, [flatApps, query, sortDir]);

    const hasResults = apps.length > 0;

    // Sentinel scrolls into view → fetch the next page. Only active once results are shown.
    const loadMoreRef = useInfiniteScrollObserver({
        hasNextPage,
        isFetchingNextPage,
        fetchNextPage,
        enabled: !isLoading && hasResults,
    });

    const renderBody = () => {
        if (isLoading) {
            return (
                <div className={GRID}>
                    {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                        <SkeletonCard key={i} />
                    ))}
                </div>
            );
        }

        if (isError) return <AppsErrorState onRetry={() => refetch()} />;

        if (flatApps.length === 0) return <AppsEmptyState />;

        if (!hasResults) {
            return (
                <p className="py-16 text-center text-sm text-muted-foreground">
                    {t('apps.noResults', 'No apps match your search')}
                </p>
            );
        }

        return (
            <>
                <div className={GRID}>
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

    const showToolbar = !isLoading && !isError && flatApps.length > 0;

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Helmet>
                <title>{t('apps.title', 'Apps')}</title>
                <meta name="description" content={t('apps.description', 'Explore apps built on Eureka Flow.')} />
            </Helmet>

            <AppsHeader />

            <section className="mx-auto max-w-[1200px] px-6 pb-6 pt-28">
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

                {showToolbar && (
                    <div className="mt-6 flex flex-wrap items-center gap-2">
                        <div className="relative min-w-0 flex-1 sm:max-w-xs">
                            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
                            <Input
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder={t('apps.searchPlaceholder', 'Search apps')}
                                aria-label={t('apps.searchPlaceholder', 'Search apps')}
                                className="h-9 rounded-xl border-border/40 bg-muted/30 pl-9 text-sm"
                            />
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSortDir(dir => (dir === 'newest' ? 'oldest' : 'newest'))}
                            className="h-9 shrink-0 gap-1.5 rounded-xl text-xs"
                        >
                            <ArrowDownUp className="h-3.5 w-3.5" />
                            {sortDir === 'newest' ? t('apps.sortNewest', 'Newest') : t('apps.sortOldest', 'Oldest')}
                        </Button>
                    </div>
                )}
            </section>

            <main className="mx-auto max-w-[1200px] px-6 pb-20">{renderBody()}</main>

            {import.meta.env.DEV && <AppsMockToggle />}
        </div>
    );
};
