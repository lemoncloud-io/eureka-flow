import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';

import { ChevronDown } from 'lucide-react';

import { useActors, useItems } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { Separator, ThemeToggle } from '@flows/ui-kit';

import { CurrentActorDropdown } from './CurrentActorDropdown';
import { NAV_GROUPS } from '../consts';
import { useCurrentActor } from '../hooks/useCurrentActor';

import type { NavGroup } from '../consts';
import type { Actor } from '@flows/flows';

const NavGroupSection = ({ group }: { group: NavGroup }) => {
    const { t } = useTranslation();
    const [collapsed, setCollapsed] = useState(false);

    const renderItems = () => (
        <div className="space-y-0.5">
            {group.items.map(({ to, icon: Icon, labelKey, fallback }) => (
                <NavLink
                    key={to}
                    to={to}
                    end={to === '/items'}
                    className={({ isActive }) =>
                        cn(
                            'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200',
                            isActive
                                ? 'bg-accent text-accent-foreground'
                                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                        )
                    }
                >
                    {({ isActive }) => (
                        <>
                            {isActive && (
                                <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
                            )}
                            <Icon className="h-4 w-4" />
                            {t(labelKey, fallback)}
                        </>
                    )}
                </NavLink>
            ))}
        </div>
    );

    if (group.collapsible) {
        return (
            <div>
                <button
                    onClick={() => setCollapsed(c => !c)}
                    className="flex w-full items-center justify-between px-3 pt-4 pb-1"
                >
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                        {t(group.labelKey, group.fallback)}
                    </span>
                    <ChevronDown
                        className={cn(
                            'h-3 w-3 text-muted-foreground/40 transition-transform',
                            collapsed && '-rotate-90'
                        )}
                    />
                </button>
                {!collapsed && renderItems()}
            </div>
        );
    }

    return (
        <div>
            <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {t(group.labelKey, group.fallback)}
            </p>
            {renderItems()}
        </div>
    );
};

const TeamSection = () => {
    const { t } = useTranslation();
    const { data: actorsData } = useActors();
    const { data: itemsData } = useItems();

    const activeActors = useMemo(() => (actorsData?.data ?? []).filter(a => a.isActive), [actorsData?.data]);

    const doingCountByActor = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const item of itemsData?.data ?? []) {
            for (const stage of item.stages) {
                if (stage.status === 'doing' && stage.actorId) {
                    counts[stage.actorId] = (counts[stage.actorId] ?? 0) + 1;
                }
            }
        }
        return counts;
    }, [itemsData?.data]);

    if (activeActors.length === 0) return null;

    return (
        <div>
            <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {t('navigator.team', 'Team')}
            </p>
            <div className="space-y-0.5">
                {activeActors.map((actor: Actor) => {
                    const doingCount = doingCountByActor[actor.id] ?? 0;
                    return (
                        <div key={actor.id} className="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm">
                            <div className={cn('h-2.5 w-2.5 rounded-full shrink-0', actor.color)} />
                            <span className="flex-1 truncate text-muted-foreground">{actor.name}</span>
                            {doingCount > 0 && <span className="text-xs text-blue-500">{doingCount}</span>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const SidebarActorCard = () => {
    const { t } = useTranslation();
    const { currentActor } = useCurrentActor();

    if (!currentActor) {
        return (
            <div className="flex items-center justify-between gap-1 px-2 py-2">
                <CurrentActorDropdown />
                <ThemeToggle />
            </div>
        );
    }

    const initials = currentActor.name
        .split(/\s+/)
        .map(part => part.charAt(0).toUpperCase())
        .slice(0, 2)
        .join('');

    return (
        <div className="flex items-center gap-2 px-3 py-2">
            <div
                className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
                    currentActor.color
                )}
            >
                {initials}
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{currentActor.name}</p>
                <p className="truncate text-[11px] uppercase tracking-wider text-muted-foreground">
                    {t(`actor.stereo.${currentActor.stereo}`, currentActor.stereo)}
                </p>
            </div>
            <CurrentActorDropdown />
            <ThemeToggle />
        </div>
    );
};

export const NavigatorSidebar = ({ className }: { className?: string }) => {
    const { t } = useTranslation();

    return (
        <aside className={cn('flex w-56 flex-col border-r border-border bg-background', className)}>
            <div className="p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {t('navigator.title', 'Navigator')}
                </p>
            </div>
            <nav className="flex-1 overflow-y-auto px-2">
                {NAV_GROUPS.map(group => (
                    <NavGroupSection key={group.labelKey} group={group} />
                ))}
                <TeamSection />
            </nav>
            <Separator />
            <SidebarActorCard />
        </aside>
    );
};
