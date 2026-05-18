import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { CheckCircle2, Circle } from 'lucide-react';

import { useActors, useReopenNoteMutation, useResolveNoteMutation } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { Badge, Button } from '@flows/ui-kit';

import { NoteForm } from './NoteForm';

import type { Note } from '@flows/flows';

const STEREO_LABELS: Record<Note['stereo'], { label: string; className: string }> = {
    comment: { label: 'Comment', className: 'bg-muted text-muted-foreground' },
    issue: { label: 'Issue', className: 'bg-orange-500/15 text-orange-600 dark:text-orange-400' },
    request: { label: 'Request', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
};

interface NoteListProps {
    notes: Note[];
    stageId: string;
}

export const NoteList = ({ notes, stageId }: NoteListProps) => {
    const { t } = useTranslation();
    const resolveMutation = useResolveNoteMutation();
    const reopenMutation = useReopenNoteMutation();
    const { data: actorsData } = useActors();
    const actorMap = useMemo(() => new Map((actorsData?.data ?? []).map(a => [a.id, a.name])), [actorsData?.data]);

    const handleToggle = (note: Note) => {
        if (note.isResolved) {
            reopenMutation.mutate(note.id);
        } else {
            resolveMutation.mutate({ id: note.id });
        }
    };

    return (
        <div className="space-y-3">
            <NoteForm stageId={stageId} />
            {notes.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                    {t('navigator.noNotes', 'No notes yet')}
                </p>
            )}
            {notes.map(note => {
                const config = STEREO_LABELS[note.stereo];
                return (
                    <div key={note.id} className="flex gap-2 rounded-md border border-border p-3">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="mt-0.5 h-5 w-5 shrink-0"
                            onClick={() => handleToggle(note)}
                        >
                            {note.isResolved ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : (
                                <Circle className="h-4 w-4 text-muted-foreground" />
                            )}
                        </Button>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <Badge variant="secondary" className={`text-[10px] ${config.className}`}>
                                    {config.label}
                                </Badge>
                                {note.actorId && actorMap.get(note.actorId) && (
                                    <span className="text-[10px] font-medium text-muted-foreground">
                                        {actorMap.get(note.actorId)}
                                    </span>
                                )}
                                {note.isResolved && (
                                    <span className="text-[10px] text-green-500">
                                        {t('navigator.resolved', 'Resolved')}
                                    </span>
                                )}
                            </div>
                            <p
                                className={cn(
                                    'mt-1 text-sm',
                                    note.isResolved && 'text-muted-foreground line-through',
                                    !note.content && 'italic text-muted-foreground/60'
                                )}
                            >
                                {note.content || t('navigator.emptyNote', '(no content)')}
                            </p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
