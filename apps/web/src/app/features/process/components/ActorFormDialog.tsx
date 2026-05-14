import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';

import { useCreateActorMutation, useUpdateActorMutation } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import {
    Button,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Textarea,
} from '@flows/ui-kit';

import type { Actor } from '@flows/flows';

const COLOR_PRESETS = [
    'bg-[#7c3aed]',
    'bg-[#2563eb]',
    'bg-[#db2777]',
    'bg-[#ea580c]',
    'bg-[#16a34a]',
    'bg-[#64748b]',
    'bg-[#dc2626]',
    'bg-[#0891b2]',
];

interface ActorFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    actor?: Actor;
}

export const ActorFormDialog = ({ open, onOpenChange, actor }: ActorFormDialogProps) => {
    const { t } = useTranslation();
    const isEdit = !!actor;
    const createMutation = useCreateActorMutation();
    const updateMutation = useUpdateActorMutation();

    const [name, setName] = useState(actor?.name ?? '');
    const [color, setColor] = useState(actor?.color ?? COLOR_PRESETS[0]);
    const [stereo, setStereo] = useState<'person' | 'team' | 'vendor'>(actor?.stereo ?? 'person');
    const [memo, setMemo] = useState(actor?.memo ?? '');

    const handleSubmit = () => {
        if (!name.trim()) return;

        if (isEdit) {
            updateMutation.mutate(
                { id: actor.id, input: { name: name.trim(), color, memo: memo || undefined } },
                {
                    onSuccess: result => {
                        result.warnings?.forEach(w => toast.warning(w));
                        onOpenChange(false);
                    },
                }
            );
        } else {
            createMutation.mutate(
                { name: name.trim(), color, stereo, memo: memo || undefined },
                {
                    onSuccess: result => {
                        result.warnings?.forEach(w => toast.warning(w));
                        onOpenChange(false);
                    },
                }
            );
        }
    };

    const isPending = createMutation.isPending || updateMutation.isPending;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {isEdit ? t('navigator.editActor', 'Edit Actor') : t('navigator.createActor', 'Create Actor')}
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>{t('navigator.actorName', 'Name')}</Label>
                        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. MD팀" />
                    </div>
                    {!isEdit && (
                        <div className="space-y-2">
                            <Label>{t('navigator.actorStereo', 'Type')}</Label>
                            <Select value={stereo} onValueChange={v => setStereo(v as typeof stereo)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="person">Person</SelectItem>
                                    <SelectItem value="team">Team</SelectItem>
                                    <SelectItem value="vendor">Vendor</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="space-y-2">
                        <Label>{t('navigator.actorColor', 'Color')}</Label>
                        <div className="flex flex-wrap gap-2">
                            {COLOR_PRESETS.map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setColor(c)}
                                    className={cn(
                                        'h-7 w-7 rounded-full transition-all',
                                        c,
                                        color === c
                                            ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                                            : 'opacity-60 hover:opacity-100'
                                    )}
                                />
                            ))}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>{t('navigator.memo', 'Memo')}</Label>
                        <Textarea value={memo} onChange={e => setMemo(e.target.value)} rows={2} />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            {t('navigator.cancel', 'Cancel')}
                        </Button>
                        <Button onClick={handleSubmit} disabled={!name.trim() || isPending}>
                            {isEdit ? t('navigator.save', 'Save') : t('navigator.create', 'Create')}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
