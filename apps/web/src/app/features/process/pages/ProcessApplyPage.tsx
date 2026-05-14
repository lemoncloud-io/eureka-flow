import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { toast } from 'sonner';

import { useApplyProcessMutation, useProcess } from '@flows/flows';
import { Button, Input, Label } from '@flows/ui-kit';

export const ProcessApplyPage = () => {
    const { t } = useTranslation();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { data: processData, isLoading } = useProcess(id ?? null);
    const applyMutation = useApplyProcessMutation();
    const [name, setName] = useState('');
    const [thumbnailUrl, setThumbnailUrl] = useState('');
    const initialized = useRef(false);

    const process = processData?.data;

    useEffect(() => {
        if (process && !initialized.current) {
            setName(`${process.name} — New Item`);
            initialized.current = true;
        }
    }, [process]);

    const handleApply = () => {
        if (!id || !name.trim()) return;
        applyMutation.mutate(
            { processId: id, input: { name: name.trim(), thumbnailUrl, processId: id } },
            {
                onSuccess: result => {
                    navigate(`/items/${result.data.id}`);
                    toast.success(t('navigator.itemCreated', 'Item created from process'));
                },
            }
        );
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="h-8 w-48 animate-pulse rounded bg-muted" />
            </div>
        );
    }

    if (!process) {
        return (
            <div className="p-12 text-center text-muted-foreground">
                {t('navigator.processNotFound', 'Process not found')}
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-md space-y-6 py-8">
            <div>
                <h1 className="text-xl font-bold">{t('navigator.applyProcess', 'Apply Process')}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{process.name}</p>
            </div>
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label>{t('navigator.itemName', 'Item Name')}</Label>
                    <Input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="e.g. 크롭 니트"
                        autoFocus
                    />
                </div>
                <div className="space-y-2">
                    <Label>{t('navigator.thumbnailUrl', 'Thumbnail URL (optional)')}</Label>
                    <Input
                        value={thumbnailUrl}
                        onChange={e => setThumbnailUrl(e.target.value)}
                        placeholder="https://..."
                    />
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => navigate(`/processes/${id}`)}>
                        {t('navigator.cancel', 'Cancel')}
                    </Button>
                    <Button onClick={handleApply} disabled={!name.trim() || applyMutation.isPending}>
                        {applyMutation.isPending
                            ? t('navigator.creating', 'Creating...')
                            : t('navigator.createItem', 'Create Item')}
                    </Button>
                </div>
            </div>
        </div>
    );
};
