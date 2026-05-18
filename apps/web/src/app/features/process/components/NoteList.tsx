import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActors } from '@flows/flows';
import { cn } from '@flows/lib/utils';

import { NoteForm } from './NoteForm';

import type { Note } from '@flows/flows';

interface NoteListProps {
    notes: Note[];
    stageId: string;
}

export const NoteList = ({ notes, stageId }: NoteListProps) => {
    const { t } = useTranslation();
    const { data: actorsData } = useActors();
    const actorMap = useMemo(() => new Map((actorsData?.data ?? []).map(a => [a.id, a.name])), [actorsData?.data]);

    return (
        <div className="space-y-3">
            <NoteForm stageId={stageId} />
            {notes.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                    {t('navigator.noNotes', 'No notes yet')}
                </p>
            )}
            {notes.map(note => (
                <div key={note.id} className="rounded-md border border-border p-3">
                    <div className="flex items-center gap-2">
                        {note.actorId && actorMap.get(note.actorId) && (
                            <span className="text-[10px] font-medium text-muted-foreground">
                                {actorMap.get(note.actorId)}
                            </span>
                        )}
                    </div>
                    <p className={cn('mt-1 text-sm', !note.content && 'italic text-muted-foreground/60')}>
                        {note.content || t('navigator.emptyNote', '(no content)')}
                    </p>
                </div>
            ))}
        </div>
    );
};
