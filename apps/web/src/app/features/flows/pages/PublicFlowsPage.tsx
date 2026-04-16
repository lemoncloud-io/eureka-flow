import { useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { GitFork, Github, Layers, Loader2, Search } from 'lucide-react';

import { usePublicFlowsInfiniteQuery, useS3Image } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { ApiKeyDialog, SITE_URL } from '@flows/shared';
import { Badge, Button, Input, LanguageSwitcher, ThemeToggle } from '@flows/ui-kit';
import { useWebCoreStore } from '@flows/web-core';

import { formatRelativeTime } from '../utils';

import type { FlowView } from '@flows/flows';

// ============================================================================
// Constants
// ============================================================================

const STAGGER_DELAY_MS = 40;

const staggerStyle = (index: number): React.CSSProperties => ({
    animationDelay: `${STAGGER_DELAY_MS * index}ms`,
    opacity: 0,
});

// ============================================================================
// MiniFlowGraph - fallback when no thumbnail
// ============================================================================

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
        <svg viewBox="0 0 128 48" className="w-full h-full" fill="none">
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

// ============================================================================
// MasonryFlowCard — image-only card, info on hover (higgsfield style)
// ============================================================================

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
                'animate-fade-in-up group relative block overflow-hidden rounded-lg',
                'transition-all duration-300',
                'hover:ring-2 hover:ring-primary/50 hover:shadow-xl hover:shadow-primary/10'
            )}
            style={staggerStyle(index)}
        >
            <div className="relative w-full overflow-hidden">
                {hasThumbnail ? (
                    <img
                        src={thumbnailSrc}
                        alt={title}
                        className="block w-full h-auto transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                ) : (
                    <div className="w-full aspect-[4/3] flex items-center justify-center bg-muted/30">
                        <div className="w-3/4 h-3/4 opacity-30">
                            <MiniFlowGraph nodeCount={nodeCount} edgeCount={edgeCount} />
                        </div>
                    </div>
                )}

                {/* Hover overlay — glassmorphic bottom bar */}
                <div
                    className={cn(
                        'absolute inset-x-0 bottom-0 translate-y-full',
                        'group-hover:translate-y-0 transition-transform duration-300 ease-out'
                    )}
                >
                    <div className="bg-black/60 backdrop-blur-md px-3 py-2.5">
                        <h3 className="text-[13px] font-medium text-white line-clamp-1">{title}</h3>
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-white/60">
                            <span className="flex items-center gap-1">
                                <Layers className="w-3 h-3" />
                                {nodeCount}
                            </span>
                            <span className="flex items-center gap-1">
                                <GitFork className="w-3 h-3" />
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

// ============================================================================
// PublicFlowsPage
// ============================================================================

export const PublicFlowsPage = () => {
    const { t } = useTranslation(['flows']);
    const navigate = useNavigate();
    const { apiKey, setApiKey } = useWebCoreStore();
    const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = usePublicFlowsInfiniteQuery(true);

    // Enable page scroll (body has overflow:hidden for the flow editor)
    useEffect(() => {
        document.documentElement.classList.add('landing-scroll');
        return () => document.documentElement.classList.remove('landing-scroll');
    }, []);

    const [search, setSearch] = useState('');
    const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false);

    // Infinite scroll trigger via IntersectionObserver
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
        <div className="min-h-screen bg-background text-foreground">
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
            </Helmet>

            {/* ── Header ── */}
            <nav className="fixed top-0 right-0 left-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/30">
                <div className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-2.5 sm:px-6">
                    <div className="flex items-center gap-3">
                        <Link to="/" className="flex items-center gap-2 hover:opacity-70 transition-opacity">
                            <img
                                src="/logo/purple-symbol.png"
                                alt="Eureka Flow"
                                className="h-6 w-6"
                                width={24}
                                height={24}
                            />
                            <span className="text-sm font-semibold hidden sm:inline">Eureka Flow</span>
                        </Link>
                        <Badge className="pulse-soft text-[10px]">Beta</Badge>
                    </div>

                    {/* Inline search — always visible in header */}
                    <div className="relative flex-1 max-w-xs mx-4 hidden sm:block">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
                        <Input
                            placeholder={t('publicFlows.searchPlaceholder', 'Search public flows...')}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-9 h-8 text-xs rounded-lg bg-muted/30 border-border/30"
                        />
                    </div>

                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="hidden sm:inline-flex h-8 w-8" asChild>
                            <a
                                href="https://github.com/lemoncloud-io/eureka-flow"
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="GitHub"
                            >
                                <Github size={16} />
                            </a>
                        </Button>
                        <LanguageSwitcher />
                        <ThemeToggle />
                        {apiKey ? (
                            <Button size="sm" className="h-8 text-xs" onClick={() => navigate('/editor')}>
                                {t('publicFlows.goToEditor', 'Go to Editor')}
                            </Button>
                        ) : (
                            <Button size="sm" className="h-8 text-xs" onClick={() => setIsApiKeyDialogOpen(true)}>
                                {t('publicFlows.signIn', 'Sign in')}
                            </Button>
                        )}
                    </div>
                </div>
            </nav>

            {/* ── Compact Hero ── */}
            <section className="max-w-[1600px] mx-auto px-4 sm:px-6 pt-16 pb-4">
                <div className="flex items-center justify-between pt-4">
                    <div>
                        <h1 className="animate-fade-in-up text-lg font-semibold tracking-tight" style={staggerStyle(0)}>
                            {t('publicFlows.heroTitlePrefix', 'Explore')}{' '}
                            <span className="text-primary">{t('publicFlows.heroTitleHighlight', 'Public Flows')}</span>
                        </h1>
                        <p className="animate-fade-in-up text-xs text-muted-foreground mt-0.5" style={staggerStyle(1)}>
                            {totalCount > 0
                                ? t('publicFlows.flowCount', '{{count}} flows', { count: totalCount })
                                : t(
                                      'publicFlows.heroDescription',
                                      'Discover and learn from workflows shared by the community. Open any flow to see how it works.'
                                  )}
                        </p>
                    </div>

                    {/* Mobile search */}
                    <div className="relative sm:hidden w-36">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
                        <Input
                            placeholder={t('publicFlows.searchPlaceholder', 'Search...')}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-8 h-8 text-xs rounded-lg bg-muted/30 border-border/30"
                        />
                    </div>
                </div>
            </section>

            {/* ── Gallery ── */}
            <main className="max-w-[1600px] mx-auto px-4 sm:px-6 pb-16">
                {isLoading ? (
                    <div className="flex items-center justify-center py-32">
                        <Loader2 className="w-6 h-6 text-muted-foreground/40 animate-spin" />
                    </div>
                ) : publicFlows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-32 text-muted-foreground">
                        <p className="text-sm font-medium mb-1">
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
                        {/* Masonry grid — tight gaps like higgsfield */}
                        <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-1.5">
                            {publicFlows.map((flow, i) => (
                                <div key={flow.id} className="mb-1.5 break-inside-avoid-column">
                                    <MasonryFlowCard flow={flow} index={i} />
                                </div>
                            ))}
                        </div>
                        {/* Infinite scroll sentinel */}
                        <div ref={loadMoreRef} className="flex justify-center py-8">
                            {isFetchingNextPage && (
                                <Loader2 className="w-5 h-5 text-muted-foreground/40 animate-spin" />
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
