import { useTranslation } from 'react-i18next';

import { cn } from '@flows/lib/utils';

import type { Actor } from '@flows/flows';

interface ActorFilterPillsProps {
    actors: Actor[];
    selectedActorId: string | null;
    onSelect: (actorId: string | null) => void;
}

export const ActorFilterPills = ({ actors, selectedActorId, onSelect }: ActorFilterPillsProps) => {
    const { t } = useTranslation();
    return (
        <div className="flex flex-wrap gap-1.5">
            <button
                onClick={() => onSelect(null)}
                className={cn(
                    'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                    !selectedActorId
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
            >
                {t('common.all', 'All')}
            </button>
            {actors.map(actor => (
                <button
                    key={actor.id}
                    onClick={() => onSelect(actor.id)}
                    className={cn(
                        'flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                        selectedActorId === actor.id
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                >
                    <span className={cn('h-2 w-2 rounded-full', actor.color)} />
                    {actor.name}
                </button>
            ))}
        </div>
    );
};
