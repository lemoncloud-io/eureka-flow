import { useTranslation } from 'react-i18next';

import { Check, UserCircle } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import {
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@flows/ui-kit';

import { useCurrentActor } from '../hooks/useCurrentActor';

export const CurrentActorDropdown = () => {
    const { t } = useTranslation();
    const { currentActor, setCurrentActor, actors } = useCurrentActor();
    const activeActors = actors.filter(a => a.isActive);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 max-w-[180px]">
                    {currentActor ? (
                        <>
                            <div className={cn('h-2.5 w-2.5 rounded-full shrink-0', currentActor.color)} />
                            <span className="truncate text-xs">{currentActor.name}</span>
                        </>
                    ) : (
                        <>
                            <UserCircle className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                                {t('navigator.selectActor', 'Select Actor')}
                            </span>
                        </>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
                {activeActors.length === 0 ? (
                    <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                        {t('navigator.noActors', 'No actors yet. Create one in Actor Manager.')}
                    </div>
                ) : (
                    <>
                        {activeActors.map(actor => (
                            <DropdownMenuItem
                                key={actor.id}
                                onClick={() => setCurrentActor(actor.id)}
                                className="gap-2"
                            >
                                <div className={cn('h-2.5 w-2.5 rounded-full shrink-0', actor.color)} />
                                <span className="truncate">{actor.name}</span>
                                {actor.id === currentActor?.id && (
                                    <Check className="ml-auto h-3.5 w-3.5 text-primary" />
                                )}
                            </DropdownMenuItem>
                        ))}
                        {currentActor && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={() => setCurrentActor(null)}
                                    className="text-muted-foreground"
                                >
                                    {t('navigator.clearActor', 'Clear selection')}
                                </DropdownMenuItem>
                            </>
                        )}
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
