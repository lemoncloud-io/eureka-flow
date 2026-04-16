import { useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { GitFork, Github, Globe, Layers, Loader2, Search } from 'lucide-react';

import { usePublicFlowsInfiniteQuery, useS3Image } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { ApiKeyDialog, SITE_URL } from '@flows/shared';
import { Badge, Button, Input, LanguageSwitcher, ThemeToggle } from '@flows/ui-kit';
import { useWebCoreStore } from '@flows/web-core';

import { formatRelativeTime } from '../utils';

import type { FlowView } from '@flows/flows';
const STAGGER_DELAY_MS = 50;

const staggerStyle = (index: number): React.CSSProperties => ({
    animationDelay: `${STAGGER_DELAY_MS * index}ms`,
    opacity: 0,
});

// ============================================================================
// MiniFlowGraph - visual preview of flow topology (fallback when no thumbnail)
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
// MasonryFlowCard - thumbnail-dominant card, image drives height naturally
// ============================================================================

interface MasonryFlowCardProps {
    flow: FlowView & { id: string };
    index: number;
}

const MasonryFlowCard: React.FC<MasonryFlowCardProps> = ({ flow, index }) => {
    const { t } = useTranslation(['flows']);
    const { src: thumbnailSrc } = useS3Image(flow.thumbnail);
    const title = flow.name || t('header.untitledWorkflow');
    const description = flow.description;
    const nodeCount = flow.nodeIds$$?.length ?? 0;
    const edgeCount = flow.edgeIds$$?.length ?? 0;
    const hasThumbnail = !!thumbnailSrc;

    return (
        <Link
            to={`/flows/${flow.id}`}
            className={cn(
                'animate-fade-in-up group relative block overflow-hidden rounded-xl',
                'bg-card/50 border border-border/30 transition-all duration-300',
                'hover:border-primary/40 hover:shadow-[0_8px_30px_-8px_hsl(var(--primary)/0.2)]',
                'hover:-translate-y-0.5'
            )}
            style={staggerStyle(index)}
        >
            {/* Image — natural height drives masonry layout */}
            <div className="relative w-full overflow-hidden bg-muted/20">
                {hasThumbnail ? (
                    <img
                        src={thumbnailSrc}
                        alt={title}
                        className="block w-full h-auto object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                ) : (
                    <div className="w-full aspect-[4/3] flex items-center justify-center bg-muted/10">
                        <div className="w-3/4 h-3/4 opacity-40">
                            <MiniFlowGraph nodeCount={nodeCount} edgeCount={edgeCount} />
                        </div>
                    </div>
                )}

                {/* Always-visible bottom gradient + title */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-3 pt-10">
                    <h3 className="text-sm font-semibold text-white line-clamp-1 drop-shadow-sm">{title}</h3>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-white/70">
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

                {/* Hover overlay with description */}
                {description && (
                    <div
                        className={cn(
                            'absolute inset-0 flex items-end bg-black/50 backdrop-blur-[2px]',
                            'opacity-0 group-hover:opacity-100 transition-opacity duration-300'
                        )}
                    >
                        <div className="p-3 pt-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent w-full">
                            <h3 className="text-sm font-semibold text-white line-clamp-1 drop-shadow-sm">{title}</h3>
                            <p className="text-xs text-white/80 line-clamp-2 mt-1 leading-relaxed">{description}</p>
                            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-white/70">
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
                )}
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

    // Re-run when isLoading changes so observer attaches after sentinel mounts
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
        // No sort — API returns newest first, preserving order prevents CSS columns reflow flicker
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

            {/* Subtle background texture */}
            <div
                className="fixed inset-0 pointer-events-none opacity-[0.015]"
                style={{
                    backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
                    backgroundSize: '32px 32px',
                }}
            />

            {/* Header */}
            <nav className="fixed top-0 right-0 left-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
                    <span className="flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap sm:gap-2 sm:text-base">
                        <Link to="/" className="flex items-center gap-1.5 sm:gap-2 hover:opacity-70 transition-opacity">
                            <img
                                src="/logo/purple-symbol.png"
                                alt="Eureka Flow logo"
                                className="h-6 w-6 sm:h-7 sm:w-7"
                                width={28}
                                height={28}
                            />
                            <span className="hidden sm:inline">Eureka Flow</span>
                        </Link>
                        <Badge className="pulse-soft text-[10px]">Beta</Badge>
                    </span>
                    <div className="flex items-center gap-1 sm:gap-2">
                        <Button variant="ghost" size="icon" className="hidden sm:inline-flex" asChild>
                            <a
                                href="https://github.com/lemoncloud-io/eureka-flow"
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="GitHub"
                            >
                                <Github size={18} />
                            </a>
                        </Button>
                        <LanguageSwitcher />
                        <ThemeToggle />
                        {apiKey ? (
                            <Button size="sm" onClick={() => navigate('/editor')}>
                                {t('publicFlows.goToEditor', 'Go to Editor')}
                            </Button>
                        ) : (
                            <Button size="sm" onClick={() => setIsApiKeyDialogOpen(true)}>
                                {t('publicFlows.signIn', 'Sign in')}
                            </Button>
                        )}
                    </div>
                </div>
            </nav>

            {/* Hero */}
            <section className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-24 sm:pt-28 pb-6 sm:pb-8">
                {/* Glow accent */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[200px] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

                <div className="relative text-center">
                    <div
                        className="animate-fade-in-up inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary"
                        style={staggerStyle(0)}
                    >
                        <Globe className="w-3.5 h-3.5" />
                        {t('publicFlows.badge', 'Community Workflows')}
                    </div>
                    <h1
                        className="animate-fade-in-up text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight mb-3"
                        style={staggerStyle(1)}
                    >
                        {t('publicFlows.heroTitlePrefix', 'Explore')}{' '}
                        <span className="bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
                            {t('publicFlows.heroTitleHighlight', 'Public Flows')}
                        </span>
                    </h1>
                    <p
                        className="animate-fade-in-up text-sm sm:text-base text-muted-foreground max-w-lg mx-auto mb-6"
                        style={staggerStyle(2)}
                    >
                        {t(
                            'publicFlows.heroDescription',
                            'Discover and learn from workflows shared by the community. Open any flow to see how it works.'
                        )}
                    </p>

                    {/* Search */}
                    <div className="animate-fade-in-up relative max-w-md mx-auto" style={staggerStyle(3)}>
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                        <Input
                            placeholder={t('publicFlows.searchPlaceholder', 'Search public flows...')}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-10 h-10 rounded-xl bg-card/50 border-border/40 backdrop-blur-sm"
                        />
                    </div>
                </div>
            </section>

            {/* Content */}
            <main className="relative max-w-7xl mx-auto px-4 sm:px-6 pb-16">
                {isLoading ? (
                    <div className="flex items-center justify-center py-24">
                        <div className="flex flex-col items-center gap-3">
                            <div className="relative w-10 h-10">
                                <div className="absolute inset-0 border-4 border-border rounded-full" />
                                <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin" />
                            </div>
                            <span className="text-sm text-muted-foreground animate-pulse">
                                {t('publicFlows.loading', 'Loading flows...')}
                            </span>
                        </div>
                    </div>
                ) : publicFlows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                        <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
                            <Globe className="w-8 h-8 opacity-30" />
                        </div>
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
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-xs text-muted-foreground/60">
                                {t('publicFlows.flowCount', '{{count}} flows', { count: totalCount })}
                            </span>
                        </div>
                        {/* CSS columns masonry — varied aspect ratios create dynamic heights */}
                        <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-3">
                            {publicFlows.map((flow, i) => (
                                <div key={flow.id} className="mb-3 break-inside-avoid-column">
                                    <MasonryFlowCard flow={flow} index={i} />
                                </div>
                            ))}
                        </div>
                        {/* Infinite scroll sentinel */}
                        <div ref={loadMoreRef} className="flex justify-center py-8">
                            {isFetchingNextPage && (
                                <Loader2 className="w-5 h-5 text-muted-foreground/50 animate-spin" />
                            )}
                        </div>
                    </>
                )}
            </main>

            {/* API Key Dialog */}
            <ApiKeyDialog
                open={isApiKeyDialogOpen}
                onSubmit={handleApiKeySubmit}
                onOpenChange={setIsApiKeyDialogOpen}
                codesUrl={import.meta.env.VITE_CODES_URL}
            />
        </div>
    );
};
