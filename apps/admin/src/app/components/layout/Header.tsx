import { useNavigate } from 'react-router-dom';

import { LogOut } from 'lucide-react';

import { Button, ThemeToggle } from '@flows/ui-kit';

import { useAuthStore } from '../../features/auth';

export const Header = () => {
    const navigate = useNavigate();
    const user = useAuthStore(s => s.user);
    const logout = useAuthStore(s => s.logout);

    const handleLogout = () => {
        logout();
        navigate('/login', { replace: true });
    };

    return (
        <header className="flex h-14 items-center justify-end gap-3 border-b bg-card px-4">
            <ThemeToggle />
            {user && (
                <>
                    <span className="text-sm text-muted-foreground">{user.name}</span>
                    <Button variant="ghost" size="sm" onClick={handleLogout}>
                        <LogOut className="mr-1.5 h-4 w-4" />
                        로그아웃
                    </Button>
                </>
            )}
        </header>
    );
};
