import { useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { FlaskConical } from 'lucide-react';

import { APPS_MOCK_FLAG, appsKeys } from '@flows/flows';
import { cn } from '@flows/lib/utils';

/**
 * Dev-only toggle for the `/apps` mock data.
 *
 * Render behind `import.meta.env.DEV` so it is dropped from production bundles. Flipping it
 * writes the `APPS_MOCK_FLAG` localStorage flag that `listAppsSeo` reads, then refetches the
 * gallery — lets us style the cards while the live dev endpoint returns 0 apps.
 */
export const AppsMockToggle = () => {
    const queryClient = useQueryClient();
    const [on, setOn] = useState(() => localStorage.getItem(APPS_MOCK_FLAG) === '1');

    const toggle = () => {
        const next = !on;
        if (next) localStorage.setItem(APPS_MOCK_FLAG, '1');
        else localStorage.removeItem(APPS_MOCK_FLAG);
        setOn(next);
        queryClient.invalidateQueries({ queryKey: appsKeys.all });
    };

    return (
        <button
            type="button"
            onClick={toggle}
            title="Dev only — toggle /apps mock data"
            className={cn(
                'fixed bottom-4 left-4 z-50 flex items-center gap-1.5 rounded-full border px-3 py-1.5',
                'font-mono text-[11px] shadow-lg backdrop-blur-md transition-colors',
                on
                    ? 'border-primary/50 bg-primary/15 text-primary'
                    : 'border-border/50 bg-background/70 text-muted-foreground hover:text-foreground'
            )}
        >
            <FlaskConical className="h-3.5 w-3.5" />
            mock: {on ? 'on' : 'off'}
        </button>
    );
};
