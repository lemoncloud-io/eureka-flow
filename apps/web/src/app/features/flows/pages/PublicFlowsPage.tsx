import { useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { GitFork, Github, Layers, Loader2, Search } from 'lucide-react';

import { usePublicFlowsInfiniteQuery, useS3Image } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { ApiKeyDialog, GITHUB_URL, SITE_URL } from '@flows/shared';
import { Badge, Button, Input, LanguageSwitcher, ThemeToggle } from '@flows/ui-kit';
import { redirectToLogin, useWebCoreStore } from '@flows/web-core';

import { formatRelativeTime } from '../utils';

import type { FlowView } from '@flows/flows';

const STAGGER_DELAY_MS = 40;
const SKELETON_HEIGHTS = [200, 260, 180, 240, 220, 280, 190, 250];

const staggerStyle = (index: number): React.CSSProperties => ({
    animationDelay: `${STAGGER_DELAY_MS * index}ms`,
    opacity: 0,
});

const MiniFlowGraph: React.FC<{ nodeCount: number; edgeCount: number }> = ({ nodeCount, edgeCount }) => {
    const displayNodes = Math.min(nodeCount, 8);
    const positions = useMemo(() => {
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i < displayNodes; i++) {
            const col = i % 4;
            const row = Math.floor(i / 4);
            pts.push({
                x: 16 + col * 28 + (row % 2 === 1 ? 14 : 0),
                y: 12 + row * 20,
            });
        }
        return pts;
    }, [displayNodes]);

    const displayEdges = Math.min(edgeCount, positions.length - 1);

    return (
        <svg viewBox="0 0 128 48" className="h-full w-full" fill="none">
            {Array.from({ length: displayEdges }).map((_, i) => {
                const from = positions[i];
                const to = positions[i + 1];
                if (!from || !to) return null;
                return (
                    <line
                        key={`e${i}`}
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke="currentColor"
                        strokeWidth="1"
                        className="text-primary/20"
                    />
                );
            })}
            {positions.map((p, i) => (
                <circle
                    key={`n${i}`}
                    cx={p.x}
                    cy={p.y}
                    r="3"
                    className={cn(i === 0 ? 'fill-primary/60' : 'fill-primary/30')}
                />
            ))}
            {nodeCount > 8 && (
                <text x="120" y="44" className="fill-muted-foreground/40 text-[8px]" textAnchor="end">
                    +{nodeCount - 8}
                </text>
            )}
        </svg>
    );
};

const SkeletonCard = ({ index }: { index: number }) => {
    const h = SKELETON_HEIGHTS[index % SKELETON_HEIGHTS.length];

    return (
        <div className="mb-3 break-inside-avoid-column animate-fade-in-up" style={staggerStyle(index)}>
            <div className="rounded-2xl bg-muted/30 animate-pulse" style={{ height: `${h}px` }} />
        </div>
    );
};

interface MasonryFlowCardProps {
    flow: FlowView & { id: string };
    index: number;
}

const MasonryFlowCard: React.FC<MasonryFlowCardProps> = ({ flow, index }) => {
    const { t } = useTranslation(['flows']);
    const { src: thumbnailSrc } = useS3Image(flow.thumbnail);
    const title = flow.name || t('header.untitledWorkflow');
    const nodeCount = flow.nodeIds$$?.length ?? 0;
    const edgeCount = flow.edgeIds$$?.length ?? 0;
    const hasThumbnail = !!thumbnailSrc;

    return (
        <Link
            to={`/flows/${flow.id}`}
            className={cn(
                'animate-fade-in-up landing-card group relative block overflow-hidden rounded-2xl',
                'border border-transparent',
                'hover:border-primary/30 hover:shadow-xl hover:shadow-primary/10'
            )}
            style={staggerStyle(index)}
        >
            <div className="relative w-full overflow-hidden">
                {hasThumbnail ? (
                    <img
                        src={thumbnailSrc}
                        alt={title}
                        className="block h-auto w-full transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                    />
                ) : (
                    <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted/20">
                        <div className="h-3/4 w-3/4 opacity-30">
                            <MiniFlowGraph nodeCount={nodeCount} edgeCount={edgeCount} />
                        </div>
                    </div>
                )}

                <div
                    className={cn(
                        'absolute inset-x-0 bottom-0 translate-y-full',
                        'transition-transform duration-300 ease-out group-hover:translate-y-0'
                    )}
                >
                    <div className="bg-black/65 px-3.5 py-3 backdrop-blur-xl">
                        <h3 className="line-clamp-1 text-[13px] font-medium text-white">{title}</h3>
                        <div className="mt-1 flex items-center gap-3 text-[11px] text-white/55">
                            <span className="flex items-center gap-1">
                                <Layers className="h-3 w-3" />
                                {nodeCount}
                            </span>
                            <span className="flex items-center gap-1">
                                <GitFork className="h-3 w-3" />
                                {edgeCount}
                            </span>
                            <span className="ml-auto">{formatRelativeTime(flow.updatedAt, t)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </Link>
    );
};

export const PublicFlowsPage = () => {
    const { t } = useTranslation(['flows']);
    const navigate = useNavigate();
    const { apiKey, setApiKey } = useWebCoreStore();
    const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = usePublicFlowsInfiniteQuery(true);

    useEffect(() => {
        document.documentElement.classList.add('landing-scroll');
        return () => document.documentElement.classList.remove('landing-scroll');
    }, []);

    const [search, setSearch] = useState('');
    const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false);

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

    const totalCount = data?.pages[0]?.total ?? 0;

    const publicFlows = useMemo(() => {
        if (!data?.pages) return [];
        const allFlows = data.pages.flatMap(page => page.list);
        const query = search.trim().toLowerCase();

        return allFlows
            .filter((f): f is FlowView & { id: string } => {
                if (!f.id) return false;
                return f.isPublic === true;
            })
            .filter(f => {
                if (!query) return true;
                return (
                    (f.name ?? '').toLowerCase().includes(query) || (f.description ?? '').toLowerCase().includes(query)
                );
            });
    }, [data?.pages, search]);

    const handleApiKeySubmit = async (key: string): Promise<boolean> => {
        setApiKey(key);
        setIsApiKeyDialogOpen(false);
        navigate('/editor');
        return true;
    };

    return (
        <div className="landing-grain min-h-screen overflow-x-hidden bg-background text-foreground">
            <Helmet>
                <title>Community Flows</title>
                <meta name="description" content="Discover and explore public AI workflows shared by the community." />
                <link rel="canonical" href={`${SITE_URL}/flows`} />
                <meta property="og:title" content="Community Flows — Eureka Flow" />
                <meta
                    property="og:description"
                    content="Discover and explore public AI workflows shared by the community."
                />
                <meta property="og:url" content={`${SITE_URL}/flows`} />
                <meta property="og:image" content={`${SITE_URL}/images/screenshot-light.jpg`} />
            </Helmet>

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

                    <div className="relative mx-4 hidden max-w-xs flex-1 sm:block">
                        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
                        <Input
                            placeholder={t('publicFlows.searchPlaceholder', 'Search public flows...')}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="h-8 rounded-xl border-border/30 bg-muted/30 pl-9 text-xs"
                        />
                    </div>

                    <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" className="hidden h-8 w-8 sm:inline-flex" asChild>
                            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label="GitHub">
                                <Github size={15} />
                            </a>
                        </Button>
                        <LanguageSwitcher />
                        <ThemeToggle />
                        {apiKey ? (
                            <Button
                                size="sm"
                                className="ml-1 h-8 rounded-xl text-xs font-medium"
                                onClick={() => navigate('/editor')}
                            >
                                {t('publicFlows.goToEditor', 'Go to Editor')}
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                className="ml-1 h-8 rounded-xl text-xs font-medium"
                                onClick={() => {
                                    if (redirectToLogin()) return;
                                    setIsApiKeyDialogOpen(true);
                                }}
                            >
                                {t('publicFlows.signIn', 'Sign in')}
                            </Button>
                        )}
                    </div>
                </div>
            </nav>

            <section className="mx-auto max-w-[1200px] px-6 pb-6 pt-24">
                <div className="flex items-end justify-between gap-4 pt-4">
                    <div>
                        <h1
                            className="animate-fade-in-up text-xl font-bold tracking-tight sm:text-2xl"
                            style={staggerStyle(0)}
                        >
                            {t('publicFlows.heroTitlePrefix', 'Explore')}{' '}
                            <span className="text-primary">{t('publicFlows.heroTitleHighlight', 'Public Flows')}</span>
                        </h1>
                        <p className="animate-fade-in-up mt-1 text-sm text-muted-foreground" style={staggerStyle(1)}>
                            {totalCount > 0
                                ? t('publicFlows.flowCount', '{{count}} flows', {
                                      count: totalCount,
                                  })
                                : t(
                                      'publicFlows.heroDescription',
                                      'Discover and learn from workflows shared by the community.'
                                  )}
                        </p>
                    </div>

                    <div className="relative w-36 sm:hidden">
                        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
                        <Input
                            placeholder={t('publicFlows.searchPlaceholder', 'Search...')}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="h-8 rounded-xl border-border/30 bg-muted/30 pl-8 text-xs"
                        />
                    </div>
                </div>
            </section>

            <main className="mx-auto max-w-[1200px] px-6 pb-20">
                {isLoading ? (
                    <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-5">
                        {Array.from({ length: 12 }).map((_, i) => (
                            <SkeletonCard key={i} index={i} />
                        ))}
                    </div>
                ) : publicFlows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-32 text-muted-foreground">
                        <p className="mb-1 text-sm font-medium">
                            {search
                                ? t('publicFlows.noSearchResults', 'No flows match your search')
                                : t('publicFlows.empty', 'No public flows yet')}
                        </p>
                        <p className="text-xs text-muted-foreground/60">
                            {search
                                ? t('publicFlows.tryDifferent', 'Try a different search term')
                                : t('publicFlows.beFirst', 'Be the first to publish a workflow')}
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-5">
                            {publicFlows.map((flow, i) => (
                                <div key={flow.id} className="mb-3 break-inside-avoid-column">
                                    <MasonryFlowCard flow={flow} index={i} />
                                </div>
                            ))}
                        </div>
                        <div ref={loadMoreRef} className="flex justify-center py-10">
                            {isFetchingNextPage && (
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
                            )}
                        </div>
                    </>
                )}
            </main>

            <ApiKeyDialog
                open={isApiKeyDialogOpen}
                onSubmit={handleApiKeySubmit}
                onOpenChange={setIsApiKeyDialogOpen}
                codesUrl={import.meta.env.VITE_CODES_URL}
            />
        </div>
    );
};
