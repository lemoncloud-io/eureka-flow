import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Github } from 'lucide-react';

import { Badge, Button, LanguageSwitcher, ThemeToggle } from '@flows/ui-kit';

import { GITHUB_URL, ROUTES } from '../consts';
import { shouldShowTutorial } from '../utils';

export const NavBar = () => {
    const navigate = useNavigate();
    const { t } = useTranslation('landing');

    const handleStart = () => navigate(shouldShowTutorial() ? ROUTES.TUTORIAL : ROUTES.EDITOR);

    return (
        <nav className="fixed top-0 right-0 left-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/30">
            <div className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-2.5 sm:px-6">
                <div className="flex items-center gap-3">
                    <span className="flex items-center gap-2 text-sm font-semibold whitespace-nowrap">
                        <img
                            src="/logo/purple-symbol.png"
                            alt="Eureka Flow logo"
                            className="h-6 w-6"
                            width={24}
                            height={24}
                        />
                        <span className="hidden sm:inline">{t('nav.logo')}</span>
                    </span>
                    <Badge className="pulse-soft text-[10px]">{t('hero.badge')}</Badge>
                </div>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="hidden sm:inline-flex h-8 w-8" asChild>
                        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label={t('nav.github')}>
                            <Github size={16} />
                        </a>
                    </Button>
                    <LanguageSwitcher />
                    <ThemeToggle />
                    <Button size="sm" className="h-8 text-xs" onClick={handleStart}>
                        {t('nav.cta')}
                    </Button>
                </div>
            </div>
        </nav>
    );
};
