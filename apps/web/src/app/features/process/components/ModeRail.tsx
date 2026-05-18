import { useLocation, useNavigate } from 'react-router-dom';

import { Blocks, Compass } from 'lucide-react';

import { cn } from '@flows/lib/utils';

import { NAV_ITEMS } from '../consts';

const NAVIGATOR_PATHS = NAV_ITEMS.map(item => item.to);

export const ModeRail = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const isNavigatorActive =
        NAVIGATOR_PATHS.some(p => location.pathname === p) ||
        location.pathname.startsWith('/items/') ||
        location.pathname.startsWith('/processes/');

    const isBuilderActive = location.pathname.startsWith('/editor') || location.pathname.startsWith('/flows');

    return (
        <div className="flex w-14 flex-col items-center gap-1 border-r border-border bg-muted/30 pt-3">
            <button
                className={cn(
                    'flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-medium transition-colors',
                    isNavigatorActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
                onClick={() => navigate('/dashboard')}
                aria-label="Navigator"
            >
                <Compass className="h-5 w-5" />
                <span>Nav</span>
            </button>
            <button
                className={cn(
                    'flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-medium transition-colors',
                    isBuilderActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
                onClick={() => navigate('/editor')}
                aria-label="Builder"
            >
                <Blocks className="h-5 w-5" />
                <span>Build</span>
            </button>
        </div>
    );
};
