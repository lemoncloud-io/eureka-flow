import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';

import { cn } from '@flows/lib/utils';
import { Separator } from '@flows/ui-kit';

import { NAV_ITEMS } from '../consts';
import { SidebarNextActions } from './SidebarNextActions';

export const NavigatorSidebar = ({ className }: { className?: string }) => {
    const { t } = useTranslation();

    return (
        <aside className={cn('flex w-56 flex-col border-r border-border bg-background', className)}>
            <div className="p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {t('navigator.title', 'Navigator')}
                </p>
            </div>
            <nav className="flex-1 space-y-0.5 px-2">
                {NAV_ITEMS.map(({ to, icon: Icon, labelKey, fallback }) => (
                    <NavLink
                        key={to}
                        to={to}
                        end={to === '/'}
                        className={({ isActive }) =>
                            cn(
                                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                                isActive
                                    ? 'bg-accent text-accent-foreground'
                                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                            )
                        }
                    >
                        <Icon className="h-4 w-4" />
                        {t(labelKey, fallback)}
                    </NavLink>
                ))}
            </nav>
            <Separator />
            <SidebarNextActions />
        </aside>
    );
};
