import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { BrainCircuit, LayoutGrid, Zap } from 'lucide-react';

import { useTheme } from '@flows/theme';
import { Badge, Button, LanguageSwitcher, ThemeToggle } from '@flows/ui-kit';

import type { CSSProperties, ReactNode } from 'react';

const STAGGER_DELAY_MS = 100;

const FEATURES: { key: string; icon: ReactNode }[] = [
    { key: 'visual_canvas', icon: <LayoutGrid size={24} /> },
    { key: 'ai_nodes', icon: <BrainCircuit size={24} /> },
    { key: 'instant_run', icon: <Zap size={24} /> },
];

const staggerStyle = (index: number): CSSProperties => ({
    animationDelay: `${STAGGER_DELAY_MS * index}ms`,
    opacity: 0, // Initial hidden state; animation-fill-mode: forwards sets final opacity to 1
});

export const LandingPage = () => {
    const navigate = useNavigate();
    const { t } = useTranslation('landing');
    const { isDarkTheme } = useTheme();

    // Flow editor sets overflow: hidden on body; restore scrolling for this page
    useEffect(() => {
        document.documentElement.style.overflowY = 'scroll';
        return () => {
            document.documentElement.style.overflowY = '';
        };
    }, []);

    const handleStart = () => navigate('/editor');
    const handleDemo = () => navigate('/flow/examples');

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Nav */}
            <nav className="fixed top-0 right-0 left-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
                    <span className="flex items-center gap-2 text-base font-semibold">
                        <img src="/logo/purple-symbol.png" alt="Eureka Flow logo" className="h-7 w-7" />
                        {t('nav.logo')}
                        <Badge className="text-[10px]">{t('hero.badge')}</Badge>
                    </span>
                    <div className="flex items-center gap-2">
                        <LanguageSwitcher />
                        <ThemeToggle />
                        <Button size="sm" onClick={handleStart}>
                            {t('nav.cta')}
                        </Button>
                    </div>
                </div>
            </nav>

            {/* Hero */}
            <section className="mx-auto max-w-4xl px-6 pt-40 pb-20 text-center">
                <h1
                    className="animate-fade-in-up mb-6 text-[clamp(2.5rem,5.5vw,4.5rem)] font-bold leading-[1.1] tracking-tight"
                    style={staggerStyle(1)}
                >
                    {t('hero.title.line1')}
                    <br />
                    <span className="bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
                        {t('hero.title.accent')}
                    </span>
                    <br />
                    {t('hero.title.line2')}
                </h1>
                <p
                    className="animate-fade-in-up mx-auto mb-10 max-w-xl text-lg leading-relaxed text-muted-foreground"
                    style={staggerStyle(2)}
                >
                    {t('hero.subtitle')}
                </p>
                <div className="animate-fade-in-up flex items-center justify-center gap-4" style={staggerStyle(3)}>
                    <Button onClick={handleStart}>{t('hero.cta_primary')}</Button>
                    <Button variant="outline" onClick={handleDemo}>
                        {t('hero.cta_secondary')}
                    </Button>
                </div>
            </section>

            {/* Screenshot */}
            <div className="animate-fade-in-up mx-auto max-w-5xl px-6 pb-32" style={staggerStyle(4)}>
                <div className="overflow-hidden rounded-xl border border-border shadow-2xl">
                    <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2.5">
                        <div className="flex gap-1.5">
                            <span className="block h-3 w-3 rounded-full bg-red-400" />
                            <span className="block h-3 w-3 rounded-full bg-yellow-400" />
                            <span className="block h-3 w-3 rounded-full bg-green-400" />
                        </div>
                        <div className="mx-auto text-xs text-muted-foreground">{t('screenshot.url_bar')}</div>
                    </div>
                    <img
                        src={isDarkTheme ? '/images/다크모드_기본_설정.JPG' : '/images/라이트_기본_설정.JPG'}
                        alt={t('screenshot.alt')}
                        className="block w-full"
                    />
                </div>
            </div>

            {/* Features */}
            <section className="border-t border-border bg-muted/30 py-24">
                <div className="mx-auto max-w-6xl px-6 text-center">
                    <Badge className="mb-4">{t('features.badge')}</Badge>
                    <h2 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">{t('features.title')}</h2>
                    <p className="mx-auto mb-16 max-w-2xl text-muted-foreground">{t('features.subtitle')}</p>
                    <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
                        {FEATURES.map(({ key, icon }) => (
                            <div
                                key={key}
                                className="rounded-xl border border-border bg-card p-8 text-left transition-shadow hover:shadow-lg"
                            >
                                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    {icon}
                                </div>
                                <h3 className="mb-2 text-lg font-semibold">{t(`features.${key}.title`)}</h3>
                                <p className="text-sm leading-relaxed text-muted-foreground">
                                    {t(`features.${key}.description`)}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="py-24 text-center">
                <div className="mx-auto max-w-2xl px-6">
                    <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">{t('cta.title')}</h2>
                    <p className="mb-8 text-lg text-muted-foreground">{t('cta.subtitle')}</p>
                    <Button onClick={handleStart}>{t('cta.button')}</Button>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-border">
                <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <span className="flex items-center gap-2 text-sm text-muted-foreground">
                            <img src="/logo/purple-symbol.png" alt="Eureka Flow" className="h-5 w-5" />
                            {t('footer.brand')}
                        </span>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <Link to="/policy/terms" className="hover:text-foreground transition-colors">
                                {t('footer.terms')}
                            </Link>
                            <Link to="/policy/privacy" className="hover:text-foreground transition-colors">
                                {t('footer.privacy')}
                            </Link>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
                        <a href="mailto:app@lemoncloud.io" className="hover:text-foreground transition-colors">
                            {t('footer.email')}
                        </a>
                        <span>{t('footer.copyright')}</span>
                    </div>
                </div>
            </footer>
        </div>
    );
};
