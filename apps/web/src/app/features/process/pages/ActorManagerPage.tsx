import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Building2, Plus, User, Users } from 'lucide-react';

import { useActivateActorMutation, useActors, useDeactivateActorMutation } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { Badge, Button, Card, CardContent, Switch } from '@flows/ui-kit';

import { ActorFormDialog } from '../components/ActorFormDialog';
import { ActorWorkload } from '../components/ActorWorkload';
import { useCurrentActor } from '../hooks/useCurrentActor';

import type { Actor } from '@flows/flows';

const STEREO_ICON: Record<Actor['stereo'], React.ElementType> = {
    person: User,
    team: Users,
    vendor: Building2,
};

export const ActorManagerPage = () => {
    const { t } = useTranslation();
    const { data: actorsData, isLoading } = useActors({ staleTime: 0 });
    const { currentActor, setCurrentActor } = useCurrentActor();
    const deactivateMutation = useDeactivateActorMutation();
    const activateMutation = useActivateActorMutation();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editActor, setEditActor] = useState<Actor | undefined>();

    const actors = actorsData?.data ?? [];

    const handleToggleActive = (actor: Actor) => {
        if (actor.isActive) {
            deactivateMutation.mutate(actor.id);
        } else {
            activateMutation.mutate(actor.id);
        }
    };

    const handleEdit = (actor: Actor) => {
        setEditActor(actor);
        setDialogOpen(true);
    };

    const handleCreate = () => {
        setEditActor(undefined);
        setDialogOpen(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Users className="h-6 w-6 text-primary" />
                    <h1 className="text-2xl font-bold">{t('navigator.actors', 'Actors')}</h1>
                    {actors.length > 0 && <span className="text-sm text-muted-foreground">({actors.length})</span>}
                </div>
                <Button size="sm" onClick={handleCreate} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    {t('navigator.createActor', 'Create Actor')}
                </Button>
            </div>

            {isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
                    ))}
                </div>
            ) : actors.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="p-8 text-center">
                        <p className="text-muted-foreground">
                            {t('navigator.noActorsYet', 'No actors yet. Create your first team member or role.')}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {actors.map(actor => (
                        <Card
                            key={actor.id}
                            className={cn(
                                'transition-all',
                                !actor.isActive && 'opacity-50',
                                currentActor?.id === actor.id && 'ring-2 ring-primary/30'
                            )}
                        >
                            <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                    {(() => {
                                        const StereoIcon = STEREO_ICON[actor.stereo];
                                        return (
                                            <div
                                                className={cn(
                                                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                                                    actor.color
                                                        ? `${actor.color} text-white`
                                                        : 'bg-muted text-muted-foreground'
                                                )}
                                            >
                                                <StereoIcon className="h-4 w-4" />
                                            </div>
                                        );
                                    })()}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="font-medium truncate">{actor.name}</p>
                                            <Switch
                                                checked={actor.isActive}
                                                onCheckedChange={() => handleToggleActive(actor)}
                                            />
                                        </div>
                                        <div className="mt-0.5 flex items-center gap-2">
                                            <Badge variant="secondary" className="text-[10px]">
                                                {actor.stereo}
                                            </Badge>
                                            {currentActor?.id === actor.id && (
                                                <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                                                    {t('navigator.currentActor', 'Current')}
                                                </Badge>
                                            )}
                                        </div>
                                        {actor.memo && (
                                            <p className="mt-1.5 text-xs text-muted-foreground truncate">
                                                {actor.memo}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="mt-3 flex items-center gap-2 border-t border-border/50 pt-3">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleEdit(actor)}
                                        className="h-7 text-xs"
                                    >
                                        {t('navigator.edit', 'Edit')}
                                    </Button>
                                    {currentActor?.id !== actor.id && actor.isActive && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setCurrentActor(actor.id)}
                                            className="h-7 text-xs"
                                        >
                                            {t('navigator.setAsCurrent', 'Set as me')}
                                        </Button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <ActorWorkload />

            <ActorFormDialog
                key={editActor?.id ?? 'create'}
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                actor={editActor}
            />
        </div>
    );
};
