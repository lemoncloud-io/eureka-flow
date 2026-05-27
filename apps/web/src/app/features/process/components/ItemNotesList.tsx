import { useTranslation } from 'react-i18next';

import { NoteList } from './NoteList';

import type { Stage } from '@flows/flows';

interface ItemNotesListProps {
    stages: Stage[];
}

export const ItemNotesList = ({ stages }: ItemNotesListProps) => {
    const { t } = useTranslation();

    const stagesWithNotes = stages.filter(s => s.notes.length > 0);

    if (stagesWithNotes.length === 0) {
        return (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('navigator.noNotes', 'No notes yet')}</p>
        );
    }

    return (
        <div className="space-y-6">
            {stagesWithNotes.map(stage => (
                <div key={stage.id}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {stage.name}
                    </h3>
                    <NoteList notes={stage.notes} stageId={stage.id} />
                </div>
            ))}
        </div>
    );
};
