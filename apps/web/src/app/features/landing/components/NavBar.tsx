import { useTranslation } from 'react-i18next';

import { Github } from 'lucide-react';

import { Badge, Button, LanguageSwitcher, ThemeToggle } from '@flows/ui-kit';

import { GITHUB_URL } from '../consts';
import { useStartNavigation } from '../hooks';

export const NavBar = () => {
    const { t } = useTranslation('landing');
    const handleStart = useStartNavigation();

    return (
        <nav className="fixed top-0 right-0 left-0 z-50 flex justify-center px-4 pt-4">
            <div className="flex w-full max-w-[1200px] items-center justify-between rounded-2xl border border-border/40 bg-background/70 px-4 py-2 backdrop-blur-2xl">
                <div className="flex items-center gap-2.5">
                    <img
                        src="/logo/purple-symbol.png"
                        alt="Eureka Flow logo"
                        className="h-6 w-6"
                        width={24}
                        height={24}
                    />
                    <span className="hidden text-sm font-semibold tracking-tight sm:inline">{t('nav.logo')}</span>
                    <Badge className="pulse-soft text-[10px]">{t('hero.badge')}</Badge>
                </div>
                <div className="flex items-center gap-0.5">
                    <Button variant="ghost" size="icon" className="hidden h-8 w-8 sm:inline-flex" asChild>
                        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label={t('nav.github')}>
                            <Github size={15} />
                        </a>
                    </Button>
                    <LanguageSwitcher />
                    <ThemeToggle />
                    <Button size="sm" className="ml-1 h-8 rounded-xl text-xs font-medium" onClick={handleStart}>
                        {t('nav.cta')}
                    </Button>
                </div>
            </div>
        </nav>
    );
};
