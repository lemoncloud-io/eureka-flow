import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAddNoteMutation } from '@flows/flows';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@flows/ui-kit';

interface NoteFormProps {
    stageId: string;
}

export const NoteForm = ({ stageId }: NoteFormProps) => {
    const { t } = useTranslation();
    const [content, setContent] = useState('');
    const [stereo, setStereo] = useState<'comment' | 'issue' | 'request'>('comment');
    const addNoteMutation = useAddNoteMutation();

    const handleSubmit = () => {
        if (!content.trim()) return;
        addNoteMutation.mutate(
            { stageId, input: { content: content.trim(), stereo } }, // TODO Phase 5: wire authorId from current actor
            { onSuccess: () => setContent('') }
        );
    };

    return (
        <div className="space-y-2">
            <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder={t('navigator.notePlaceholder', 'Write a note...')}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                rows={2}
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
