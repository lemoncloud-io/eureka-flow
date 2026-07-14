import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { Github } from 'lucide-react';

import { useAppsListQuery } from '@flows/flows';
import { GITHUB_URL } from '@flows/shared';
import { Badge, Button, LanguageSwitcher, ThemeToggle } from '@flows/ui-kit';

import { AppCard, AppsEmptyState, AppsErrorState } from '../components';

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
 * Lists the Apps owned by the signed-in user's workspace.
 *
 * `/apps` is not a public route (see `isPublicRoute()` in providers.tsx), so ApiKeyGate
 * guarantees an API key is present here — no unauthenticated branch is needed.
 */
export const AppsPage = () => {
    const { t } = useTranslation();
    const { data, isLoading, isError, refetch } = useAppsListQuery();
    const apps = data?.list ?? [];

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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {apps.map(app => (
                    <AppCard key={app.id} app={app} />
                ))}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Helmet>
                <title>{t('apps.title', 'My Apps')}</title>
                {/* A workspace-scoped list — never indexable. */}
                <meta name="robots" content="noindex" />
            </Helmet>

            <AppsHeader />

            <section className="mx-auto max-w-[1200px] px-6 pb-6 pt-28">
                <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t('apps.title', 'My Apps')}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    {t('apps.description', 'Apps deployed to your workspace. Opening one runs it in a new tab.')}
                </p>
            </section>

            <main className="mx-auto max-w-[1200px] px-6 pb-20">{renderBody()}</main>
        </div>
    );
};
