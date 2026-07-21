import { useLocation, useNavigate } from 'react-router-dom';

import { ChevronRight, LogOut } from 'lucide-react';

import { Button, ThemeToggle } from '@flows/ui-kit';

import { useAuthStore } from '../../features/auth';

const SECTION_TITLES: { prefix: string; title: string }[] = [
    { prefix: '/blocks', title: 'Blocks' },
    { prefix: '/tools', title: 'Tools' },
    { prefix: '/skills', title: 'Skills' },
    { prefix: '/i18n', title: 'i18n' },
    { prefix: '/', title: 'Dashboard' },
];

const ENV = (import.meta.env.VITE_ENV as string | undefined) ?? 'LOCAL';

export const Header = () => {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const user = useAuthStore(s => s.user);
    const logout = useAuthStore(s => s.logout);

    const section =
        SECTION_TITLES.find(s => pathname.startsWith(s.prefix)) ?? SECTION_TITLES[SECTION_TITLES.length - 1];

    const handleLogout = () => {
        logout();
        navigate('/login', { replace: true });
    };

    return (
        <header className="flex h-14 items-center justify-between gap-3 border-b bg-card px-5">
            {/* Instrument readout: where you are, in the machine's own path notation */}
            <div className="flex min-w-0 items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{section.title}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                <code className="truncate font-mono text-xs text-muted-foreground">{pathname}</code>
            </div>

            <div className="flex items-center gap-3">
                <span className="hidden items-center gap-1.5 sm:flex">
                    <span className="eyebrow text-muted-foreground/70">env</span>
                    <span className="rounded border border-wire/40 bg-wire/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-wire">
                        {ENV}
                    </span>
                </span>
                <ThemeToggle />
                {user && (
                    <>
                        <span className="h-5 w-px bg-border" />
                        <span className="font-mono text-xs text-muted-foreground">{user.name}</span>
                        <Button variant="ghost" size="sm" onClick={handleLogout}>
                            <LogOut className="mr-1.5 h-4 w-4" />
                            로그아웃
                        </Button>
                    </>
                )}
            </div>
        </header>
    );
};
