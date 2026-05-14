import { useLocation, useNavigate } from 'react-router-dom';

import { Blocks, Compass } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { Button } from '@flows/ui-kit';

import { NAV_ITEMS } from '../consts';

const NAVIGATOR_PATHS = NAV_ITEMS.map(item => item.to);

export const ModeRail = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const isNavigatorActive =
        NAVIGATOR_PATHS.some(p => location.pathname === p) ||
        location.pathname.startsWith('/items/') ||
        location.pathname.startsWith('/processes/');

    const isBuilderActive = location.pathname.startsWith('/flows');

    return (
        <div className="flex w-12 flex-col items-center gap-1 border-r border-border bg-background py-3">
            <Button
                variant="ghost"
                size="icon"
                className={cn('h-9 w-9 rounded-lg', isNavigatorActive && 'bg-accent text-accent-foreground')}
                onClick={() => navigate('/')}
                title="Navigator"
            >
                <Compass className="h-4 w-4" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                className={cn('h-9 w-9 rounded-lg', isBuilderActive && 'bg-accent text-accent-foreground')}
                onClick={() => navigate('/flows')}
                title="Builder"
            >
                <Blocks className="h-4 w-4" />
            </Button>
        </div>
    );
};
