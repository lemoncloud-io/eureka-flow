import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { Globe, KeyRound, Search } from 'lucide-react';

import { useFlowsListQuery } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { ApiKeyDialog } from '@flows/shared';
import { Button, Input } from '@flows/ui-kit';
import { useWebCoreStore } from '@flows/web-core';

import type { FlowView, PublishMeta } from '@flows/flows';

// ============================================================================
// Helpers
// ============================================================================

const formatRelativeTime = (timestamp: string | undefined): string => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
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
// FlowCard
// ============================================================================

interface PublicFlowCardProps {
    flow: FlowView & { id: string };
    meta: PublishMeta | null;
}

const PublicFlowCard: React.FC<PublicFlowCardProps> = ({ flow, meta }) => {
    const title = meta?.publishTitle || flow.name || 'Untitled';
    const description = meta?.publishDescription || flow.description;
    const nodeCount = flow.nodeIds$$?.length ?? 0;

    return (
        <Link
            to={`/flows/${flow.id}`}
            className={cn(
                'group flex flex-col gap-2 p-4 rounded-xl border transition-all',
                'bg-background/60 backdrop-blur-sm hover:bg-accent/50 hover:border-primary/30',
                'hover:shadow-md'
            )}
        >
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                    {title}
                </h3>
                <Globe className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
            </div>

            {/* Description */}
            {description && <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>}

            {/* Meta */}
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70 mt-auto">
                {flow.updatedAt && <span>{formatRelativeTime(flow.updatedAt)}</span>}
                {nodeCount > 0 && (
                    <>
                        <span>·</span>
                        <span>{nodeCount} nodes</span>
                    </>
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
                // isPublic comes as top-level field from public API
                return (f as FlowWithPublic).isPublic === true;
            })
            .filter(f => {
                if (!query) return true;
                const meta = f.meta as PublishMeta | undefined;
                return (
                    (f.name ?? '').toLowerCase().includes(query) ||
                    (f.description ?? '').toLowerCase().includes(query) ||
                    (meta?.publishTitle ?? '').toLowerCase().includes(query) ||
                    (meta?.publishDescription ?? '').toLowerCase().includes(query)
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
            {/* Header */}
            <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border/50">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link to="/" className="flex items-center gap-2 hover:opacity-70 transition-opacity">
                            <img src="/logo/purple-symbol.png" alt="Eureka Flow" className="h-6 w-6" />
                            <span className="text-sm font-semibold hidden sm:inline">Flow</span>
                        </Link>
                        <div className="w-px h-4 bg-border/60" />
                        <div className="flex items-center gap-1.5">
                            <Globe className="w-4 h-4 text-emerald-500" />
                            <h1 className="text-sm font-medium">{t('publicFlows.title', 'Public Flows')}</h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {apiKey ? (
                            <Button variant="outline" size="sm" onClick={() => navigate('/editor')}>
                                {t('publicFlows.goToEditor', 'Go to Editor')}
                            </Button>
                        ) : (
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5"
                                onClick={() => setIsApiKeyDialogOpen(true)}
                            >
                                <KeyRound className="w-3.5 h-3.5" />
                                {t('publicFlows.signIn', 'Sign in')}
                            </Button>
                        )}
                    </div>
                </div>
            </header>

            {/* Content */}
            <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
                {/* Search */}
                <div className="relative max-w-md mb-6">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder={t('publicFlows.searchPlaceholder', 'Search public flows...')}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-9 h-9"
                    />
                </div>

                {/* Grid */}
                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                            <span className="text-sm text-muted-foreground">
                                {t('publicFlows.loading', 'Loading flows...')}
                            </span>
                        </div>
                    </div>
                ) : publicFlows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                        <Globe className="w-12 h-12 mb-3 opacity-20" />
                        <p className="text-sm">
                            {search
                                ? t('publicFlows.noSearchResults', 'No flows match your search')
                                : t('publicFlows.empty', 'No public flows yet')}
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="text-xs text-muted-foreground mb-3">
                            {t('publicFlows.count', {
                                count: publicFlows.length,
                                defaultValue: '{{count}} public flows',
                            })}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {publicFlows.map(flow => (
                                <PublicFlowCard key={flow.id} flow={flow} meta={(flow.meta as PublishMeta) ?? null} />
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
