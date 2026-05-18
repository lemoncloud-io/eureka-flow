import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAddNoteMutation } from '@flows/flows';
import { Button, Textarea } from '@flows/ui-kit';

import { useCurrentActor } from '../hooks/useCurrentActor';

interface NoteFormProps {
    stageId: string;
}

export const NoteForm = ({ stageId }: NoteFormProps) => {
    const { t } = useTranslation();
    const [content, setContent] = useState('');
    const addNoteMutation = useAddNoteMutation();
    const { currentActorId } = useCurrentActor();

    const handleSubmit = () => {
        if (!content.trim()) return;
        addNoteMutation.mutate(
            { stageId, input: { content: content.trim(), authorId: currentActorId ?? undefined } },
            { onSuccess: () => setContent('') }
        );
    };

    return (
        <div className="space-y-2">
            <Textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder={t('navigator.notePlaceholder', 'Write a note...')}
                rows={2}
                className="resize-none"
                onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
                }}
            />
            <div className="flex justify-end">
                <Button size="sm" onClick={handleSubmit} disabled={!content.trim() || addNoteMutation.isPending}>
                    {t('navigator.addNote', 'Add Note')}
                </Button>
            </div>
        </div>
    );
};
