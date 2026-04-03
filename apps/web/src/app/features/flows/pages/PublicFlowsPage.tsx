import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { ArrowRight, GitFork, Github, Globe, Layers, Search } from 'lucide-react';

import { useFlowsListQuery } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { ApiKeyDialog } from '@flows/shared';
import { Badge, Button, Input, LanguageSwitcher, ThemeToggle } from '@flows/ui-kit';
import { useWebCoreStore } from '@flows/web-core';

import type { FlowView } from '@flows/flows';

// ============================================================================
// Constants
// ============================================================================

const STAGGER_DELAY_MS = 80;

const staggerStyle = (index: number): React.CSSProperties => ({
    animationDelay: `${STAGGER_DELAY_MS * index}ms`,
    opacity: 0,
});

// ============================================================================
// Helpers
// ============================================================================

const formatRelativeTime = (timestamp: string | number | undefined): string => {
    if (!timestamp) return '';
    const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp);
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 30) return `${days}d ago`;
    return date.toLocaleDateString();
};

// ============================================================================
// MiniFlowGraph - visual preview of flow topology
// ============================================================================

const MiniFlowGraph: React.FC<{ nodeCount: number; edgeCount: number }> = ({ nodeCount, edgeCount }) => {
    // Generate deterministic "node" positions from counts
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
            {/* Edges */}
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
            {/* Nodes */}
            {positions.map((p, i) => (
                <circle
                    key={`n${i}`}
                    cx={p.x}
                    cy={p.y}
                    r="3"
                    className={cn(i === 0 ? 'fill-primary/60' : 'fill-primary/30')}
                />
            ))}
            {/* Overflow indicator */}
            {nodeCount > 8 && (
                <text x="120" y="44" className="fill-muted-foreground/40 text-[8px]" textAnchor="end">
                    +{nodeCount - 8}
                </text>
            )}
        </svg>
    );
};

// ============================================================================
// FlowCard
// ============================================================================

interface PublicFlowCardProps {
    flow: FlowView & { id: string };
    index: number;
}

const PublicFlowCard: React.FC<PublicFlowCardProps> = ({ flow, index }) => {
    const title = flow.name || 'Untitled';
    const description = flow.description;
    const nodeCount = flow.nodeIds$$?.length ?? 0;
    // edgeIds$$ comes from API but isn't on FlowModel type
    const edgeCount = (flow as unknown as { edgeIds$$?: string[] }).edgeIds$$?.length ?? 0;

    return (
        <Link
            to={`/flows/${flow.id}`}
            className={cn(
                'animate-fade-in-up group relative flex flex-col rounded-2xl border transition-all duration-300',
                'bg-card/50 backdrop-blur-sm border-border/40',
                'hover:border-primary/40 hover:shadow-[0_8px_30px_-8px_hsl(var(--primary)/0.15)]',
                'hover:-translate-y-0.5'
            )}
            style={staggerStyle(index + 3)}
        >
            {/* Graph Preview */}
            <div className="relative h-20 overflow-hidden rounded-t-2xl bg-muted/20 border-b border-border/20 px-3 pt-3">
                <MiniFlowGraph nodeCount={nodeCount} edgeCount={edgeCount} />
                {/* Gradient fade */}
                <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-card/80 to-transparent" />
            </div>

            {/* Content */}
            <div className="flex flex-1 flex-col gap-1.5 p-4 pt-3">
                <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                    {title}
                </h3>

                {description ? (
                    <p className="text-xs text-muted-foreground/80 line-clamp-2 leading-relaxed">{description}</p>
                ) : (
                    <p className="text-xs text-muted-foreground/40 italic">No description</p>
                )}

                {/* Footer */}
                <div className="flex items-center gap-3 mt-auto pt-2 text-[11px] text-muted-foreground/60">
                    <span className="flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        {nodeCount}
                    </span>
                    <span className="flex items-center gap-1">
                        <GitFork className="w-3 h-3" />
                        {edgeCount}
                    </span>
                    <span className="ml-auto">{formatRelativeTime(flow.updatedAt)}</span>
                </div>
            </div>

            {/* Hover arrow */}
            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowRight className="w-4 h-4 text-primary" />
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
    const { data, isLoading } = useFlowsListQuery(true);

    const [search, setSearch] = useState('');
    const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false);

    const publicFlows = useMemo(() => {
        if (!data?.list) return [];
        const query = search.trim().toLowerCase();

        // API returns isPublic as a top-level field on each flow
        type FlowWithPublic = FlowView & { id: string; isPublic?: boolean };

        return [...data.list]
            .filter((f): f is FlowWithPublic => {
                if (!f.id) return false;
                return (f as FlowWithPublic).isPublic === true;
            })
            .filter(f => {
                if (!query) return true;
                return (
                    (f.name ?? '').toLowerCase().includes(query) || (f.description ?? '').toLowerCase().includes(query)
                );
            })
            .sort((a, b) => {
                const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
                const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
                return bTime - aTime;
            });
    }, [data?.list, search]);

    const handleApiKeySubmit = async (key: string): Promise<boolean> => {
        setApiKey(key);
        setIsApiKeyDialogOpen(false);
        navigate('/editor');
        return true;
    };

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Subtle background texture */}
            <div
                className="fixed inset-0 pointer-events-none opacity-[0.015]"
                style={{
                    backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
                    backgroundSize: '32px 32px',
                }}
            />

            {/* Header - matches landing NavBar */}
            <nav className="fixed top-0 right-0 left-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
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
            <section className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-24 sm:pt-28 pb-8 sm:pb-10">
                {/* Glow accent */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[200px] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

                <div className="relative text-center">
                    <div
                        className="animate-fade-in-up inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary"
                        style={staggerStyle(0)}
                    >
                        <Globe className="w-3.5 h-3.5" />
                        Community Workflows
                    </div>
                    <h1
                        className="animate-fade-in-up text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight mb-3"
                        style={staggerStyle(1)}
                    >
                        Explore{' '}
                        <span className="bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
                            Public Flows
                        </span>
                    </h1>
                    <p
                        className="animate-fade-in-up text-sm sm:text-base text-muted-foreground max-w-lg mx-auto mb-8"
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
            <main className="relative max-w-6xl mx-auto px-4 sm:px-6 pb-16">
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
                                : 'No public flows yet'}
                        </p>
                        <p className="text-xs text-muted-foreground/60">
                            {search ? 'Try a different search term' : 'Be the first to publish a workflow'}
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-xs text-muted-foreground/60">
                                {publicFlows.length} {publicFlows.length === 1 ? 'flow' : 'flows'}
                            </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {publicFlows.map((flow, i) => (
                                <PublicFlowCard key={flow.id} flow={flow} index={i} />
                            ))}
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
