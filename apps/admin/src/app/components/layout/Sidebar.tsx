import { NavLink } from 'react-router-dom';

import { Blocks, Languages, LayoutDashboard, Sparkles, Wrench } from 'lucide-react';

import { cn } from '@flows/lib/utils';

import type { LucideIcon } from 'lucide-react';

const NAV_ITEMS: { to: string; label: string; path: string; icon: LucideIcon }[] = [
    { to: '/', label: '대시보드', path: '~/', icon: LayoutDashboard },
    { to: '/blocks', label: '블록 관리', path: '/blocks', icon: Blocks },
    { to: '/tools', label: 'Tool 관리', path: '/tools', icon: Wrench },
    { to: '/skills', label: 'Skill 관리', path: '/skills', icon: Sparkles },
    { to: '/i18n', label: '번역 관리', path: '/i18n', icon: Languages },
];

export const Sidebar = () => {
    return (
        <aside className="flex w-60 shrink-0 flex-col border-r bg-card">
            {/* Brand terminal */}
            <div className="flex h-14 items-center gap-2.5 border-b px-5">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                </span>
                <span className="text-[15px] font-bold tracking-tight text-foreground">Eureka</span>
                <span className="font-mono text-xs text-muted-foreground">/admin</span>
            </div>

            {/* Signal rail: a wire threads the nav, each route is a tap on it */}
            <nav className="relative flex flex-1 flex-col gap-0.5 px-3 py-3">
                <span className="eyebrow mb-2 pl-9 text-muted-foreground">Console</span>
                {/* the wire — runs through the node markers' centers (nav px-3 + pl-2 + half of w-6 = 31px) */}
                <span className="pointer-events-none absolute bottom-3 left-[31px] top-10 w-px bg-border" aria-hidden />
                {NAV_ITEMS.map(item => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/'}
                        className={({ isActive }) =>
                            cn(
                                'group relative flex items-center gap-3 rounded-md py-2 pl-2 pr-3 transition-colors',
                                isActive ? 'bg-accent/60' : 'hover:bg-muted'
                            )
                        }
                    >
                        {({ isActive }) => (
                            <>
                                {/* node marker sitting on the wire */}
                                <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center">
                                    <span
                                        className={cn(
                                            'flex h-2.5 w-2.5 items-center justify-center rounded-full border transition-all',
                                            isActive
                                                ? 'border-primary bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.18)]'
                                                : 'border-border bg-card group-hover:border-primary/60'
                                        )}
                                    />
                                </span>
                                <item.icon
                                    className={cn(
                                        'h-4 w-4 shrink-0 transition-colors',
                                        isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                                    )}
                                />
                                <span className="flex min-w-0 flex-col leading-tight">
                                    <span
                                        className={cn(
                                            'truncate text-sm font-medium',
                                            isActive ? 'text-foreground' : 'text-muted-foreground'
                                        )}
                                    >
                                        {item.label}
                                    </span>
                                    <span
                                        className={cn(
                                            'truncate font-mono text-[10px]',
                                            isActive ? 'text-primary/80' : 'text-muted-foreground/60'
                                        )}
                                    >
                                        {item.path}
                                    </span>
                                </span>
                            </>
                        )}
                    </NavLink>
                ))}
            </nav>

            {/* Status readout */}
            <div className="border-t px-5 py-2.5">
                <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                    <span>signal · online</span>
                </div>
            </div>
        </aside>
    );
};
