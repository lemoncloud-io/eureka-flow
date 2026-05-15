import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';

import { Blocks, ChevronRight, Menu } from 'lucide-react';

import { useItem } from '@flows/flows';
import { Button, ThemeToggle } from '@flows/ui-kit';

import { NAV_ITEMS } from '../consts';
import { CurrentActorDropdown } from './CurrentActorDropdown';
import { LivenessIndicator } from './LivenessIndicator';
import { UnresolvedNotesBadge } from './UnresolvedNotesBadge';

interface NavigatorHeaderProps {
    onMenuClick?: () => void;
}

const CRUMB_LINK = 'text-muted-foreground hover:text-foreground transition-colors';
const CRUMB_SEP = 'h-3 w-3 text-muted-foreground/50';

const HeaderBreadcrumb = () => {
    const { t } = useTranslation();
    const { id, stageId } = useParams<{ id: string; stageId: string }>();
    const location = useLocation();
    const { data: itemData } = useItem(id ?? null);

    const item = itemData?.data;
    const stage = stageId ? item?.stages.find(s => s.id === stageId) : undefined;

    if (id && item) {
        return (
            <div className="flex items-center gap-1.5 text-sm">
                <Link to="/items" className={CRUMB_LINK}>
                    {t('navigator.items', 'Items')}
                </Link>
                <ChevronRight className={CRUMB_SEP} />
                {stage ? (
                    <>
                        <Link to={`/items/${id}`} className={`max-w-[120px] truncate ${CRUMB_LINK}`}>
                            {item.name}
                        </Link>
                        <ChevronRight className={CRUMB_SEP} />
                        <span className="max-w-[120px] truncate font-semibold">{stage.name}</span>
                    </>
                ) : (
                    <span className="max-w-[200px] truncate font-semibold">{item.name}</span>
                )}
            </div>
        );
    }

    const match =
        NAV_ITEMS.find(nav => nav.to === location.pathname) ??
        NAV_ITEMS.find(nav => nav.to !== '/dashboard' && location.pathname.startsWith(nav.to));
    const title = match ? t(match.labelKey, match.fallback) : 'Navigator';

    return <span className="text-lg font-semibold">{title}</span>;
};

export const NavigatorHeader = ({ onMenuClick }: NavigatorHeaderProps) => {
    const { t } = useTranslation();

    return (
        <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="h-8 w-8 sm:hidden" onClick={onMenuClick}>
                    <Menu className="h-4 w-4" />
                </Button>
                <HeaderBreadcrumb />
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
