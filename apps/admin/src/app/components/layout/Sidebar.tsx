import { NavLink } from 'react-router-dom';

import { Blocks, LayoutDashboard, Sparkles, Wrench } from 'lucide-react';

import { cn } from '@flows/lib/utils';

import type { LucideIcon } from 'lucide-react';

const NAV_ITEMS: { to: string; label: string; icon: LucideIcon }[] = [
    { to: '/', label: '대시보드', icon: LayoutDashboard },
    { to: '/blocks', label: '블록 관리', icon: Blocks },
    { to: '/tools', label: 'Tool 관리', icon: Wrench },
    { to: '/skills', label: 'Skill 관리', icon: Sparkles },
];

export const Sidebar = () => {
    return (
        <aside className="flex w-56 flex-col border-r bg-card">
            <div className="flex h-14 items-center border-b px-4">
                <span className="text-lg font-bold text-foreground">Eureka Admin</span>
            </div>
            <nav className="flex flex-1 flex-col gap-1 p-3">
                {NAV_ITEMS.map(item => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/'}
                        className={({ isActive }) =>
                            cn(
                                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                                isActive
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                            )
                        }
                    >
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                    </NavLink>
                ))}
            </nav>
        </aside>
    );
};
