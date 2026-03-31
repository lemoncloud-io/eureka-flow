import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Github } from 'lucide-react';

import { Badge, Button, LanguageSwitcher, ThemeToggle } from '@flows/ui-kit';

import { GITHUB_URL, ROUTES } from '../consts';

const ICON_SIZE_MD = 18;

export const NavBar = () => {
    const navigate = useNavigate();
    const { t } = useTranslation('landing');

    const handleStart = () => navigate(ROUTES.EDITOR);

    return (
        <nav className="fixed top-0 right-0 left-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
                <span className="flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap sm:gap-2 sm:text-base">
                    <img
                        src="/logo/purple-symbol.png"
                        alt="Eureka Flow logo"
                        className="h-6 w-6 sm:h-7 sm:w-7"
                        width={28}
                        height={28}
                    />
                    <span className="hidden sm:inline">{t('nav.logo')}</span>
                    <Badge className="pulse-soft text-[10px]">{t('hero.badge')}</Badge>
                </span>
                <div className="flex items-center gap-1 sm:gap-2">
                    <Button variant="ghost" size="icon" className="hidden sm:inline-flex" asChild>
                        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label={t('nav.github')}>
                            <Github size={ICON_SIZE_MD} />
                        </a>
                    </Button>
                    <LanguageSwitcher />
                    <ThemeToggle />
                    <Button size="sm" onClick={handleStart}>
                        {t('nav.cta')}
                    </Button>
                </div>
            </div>
        </nav>
    );
};
