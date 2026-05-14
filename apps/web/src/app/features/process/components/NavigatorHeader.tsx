import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';

import { Blocks, Menu } from 'lucide-react';

import { Button, ThemeToggle } from '@flows/ui-kit';

import { NAV_ITEMS } from '../consts';
import { CurrentActorDropdown } from './CurrentActorDropdown';
import { LivenessIndicator } from './LivenessIndicator';
import { UnresolvedNotesBadge } from './UnresolvedNotesBadge';

interface NavigatorHeaderProps {
    onMenuClick?: () => void;
}

export const NavigatorHeader = ({ onMenuClick }: NavigatorHeaderProps) => {
    const { t } = useTranslation();
    const location = useLocation();

    const match =
        NAV_ITEMS.find(item => item.to === location.pathname) ??
        NAV_ITEMS.find(item => item.to !== '/dashboard' && location.pathname.startsWith(item.to));
    const title = match ? t(match.labelKey, match.fallback) : 'Navigator';

    return (
        <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="h-8 w-8 sm:hidden" onClick={onMenuClick}>
                    <Menu className="h-4 w-4" />
                </Button>
                <span className="text-lg font-semibold">{title}</span>
            </div>

            <div className="flex items-center gap-2">
                <LivenessIndicator />
                <UnresolvedNotesBadge />
                <CurrentActorDropdown />
                <ThemeToggle />
                <Link to="/flows">
                    <Button variant="outline" size="sm" className="gap-1.5">
                        <Blocks className="h-3.5 w-3.5" />
                        {t('navigator.buildFlow', 'Build Flow')}
                    </Button>
                </Link>
            </div>
        </header>
    );
};
