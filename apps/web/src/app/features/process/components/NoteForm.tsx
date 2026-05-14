import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAddNoteMutation } from '@flows/flows';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@flows/ui-kit';

import { useCurrentActor } from '../hooks/useCurrentActor';

interface NoteFormProps {
    stageId: string;
}

export const NoteForm = ({ stageId }: NoteFormProps) => {
    const { t } = useTranslation();
    const [content, setContent] = useState('');
    const [stereo, setStereo] = useState<'comment' | 'issue' | 'request'>('comment');
    const addNoteMutation = useAddNoteMutation();
    const { currentActorId } = useCurrentActor();

    const handleSubmit = () => {
        if (!content.trim()) return;
        addNoteMutation.mutate(
            { stageId, input: { content: content.trim(), stereo, authorId: currentActorId ?? undefined } },
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
            />
            <div className="flex items-center justify-between gap-2">
                <Select value={stereo} onValueChange={v => setStereo(v as typeof stereo)}>
                    <SelectTrigger className="w-32 h-8 text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="comment">{t('navigator.noteComment', 'Comment')}</SelectItem>
                        <SelectItem value="issue">{t('navigator.noteIssue', 'Issue')}</SelectItem>
                        <SelectItem value="request">{t('navigator.noteRequest', 'Request')}</SelectItem>
                    </SelectContent>
                </Select>
                <Button size="sm" onClick={handleSubmit} disabled={!content.trim() || addNoteMutation.isPending}>
                    {t('navigator.addNote', 'Add Note')}
                </Button>
            </div>
        </div>
    );
};
