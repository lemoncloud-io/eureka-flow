import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';

import { Menu } from 'lucide-react';

import { useItem } from '@flows/flows';
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
    Button,
    ThemeToggle,
} from '@flows/ui-kit';

import { NAV_ITEMS } from '../consts';
import { CurrentActorDropdown } from './CurrentActorDropdown';
import { LivenessIndicator } from './LivenessIndicator';
import { UnresolvedNotesBadge } from './UnresolvedNotesBadge';

interface NavigatorHeaderProps {
    onMenuClick?: () => void;
}

const HeaderBreadcrumb = () => {
    const { t } = useTranslation();
    const { id, stageId } = useParams<{ id: string; stageId: string }>();
    const location = useLocation();
    const isItemRoute = location.pathname.startsWith('/items/');
    const { data: itemData } = useItem(isItemRoute ? (id ?? null) : null);

    const item = itemData?.data;
    const stage = stageId ? item?.stages.find(s => s.id === stageId) : undefined;

    if (id && item) {
        return (
            <Breadcrumb>
                <BreadcrumbList>
                    <BreadcrumbItem>
                        <BreadcrumbLink asChild>
                            <Link to="/items">{t('navigator.items', 'Items')}</Link>
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    {stage ? (
                        <>
                            <BreadcrumbItem>
                                <BreadcrumbLink asChild>
                                    <Link to={`/items/${id}`} className="max-w-[120px] truncate">
                                        {item.name}
                                    </Link>
                                </BreadcrumbLink>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                <BreadcrumbPage className="max-w-[120px] truncate">{stage.name}</BreadcrumbPage>
                            </BreadcrumbItem>
                        </>
                    ) : (
                        <BreadcrumbItem>
                            <BreadcrumbPage className="max-w-[200px] truncate">{item.name}</BreadcrumbPage>
                        </BreadcrumbItem>
                    )}
                </BreadcrumbList>
            </Breadcrumb>
        );
    }

    const match =
        NAV_ITEMS.find(nav => nav.to === location.pathname) ??
        NAV_ITEMS.find(nav => nav.to !== '/items' && location.pathname.startsWith(nav.to));
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
            </div>
        </header>
    );
};
