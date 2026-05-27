import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { useApplyProcessMutation, useProcesses } from '@flows/flows';
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@flows/ui-kit';

export const NewItemDialog = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { data: processesData } = useProcesses();
    const applyMutation = useApplyProcessMutation();
    const [open, setOpen] = useState(false);
    const [selectedProcessId, setSelectedProcessId] = useState('');
    const [name, setName] = useState('');

    const processes = processesData?.data ?? [];

    const handleCreate = () => {
        if (!selectedProcessId || !name.trim()) return;
        applyMutation.mutate(
            {
                processId: selectedProcessId,
                input: { name: name.trim(), thumbnailUrl: '', processId: selectedProcessId },
            },
            {
                onSuccess: result => {
                    setOpen(false);
                    setName('');
                    setSelectedProcessId('');
                    navigate(`/items/${result.data.id}`);
                    toast.success(t('navigator.itemCreated', 'Item created!'));
                },
            }
        );
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    {t('navigator.newItem', 'New Item')}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('navigator.newItem', 'New Item')}</DialogTitle>
                    <DialogDescription>
                        {t('navigator.newItemDesc', 'Select a process template and give your item a name.')}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">{t('navigator.process', 'Process')}</label>
                        {processes.length > 0 ? (
                            <Select value={selectedProcessId} onValueChange={setSelectedProcessId}>
                                <SelectTrigger>
                                    <SelectValue placeholder={t('navigator.selectProcess', 'Select a process...')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {processes.map(p => (
                                        <SelectItem key={p.id} value={p.id}>
                                            {p.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                {t('navigator.noProcesses', 'No process templates available.')}
                            </p>
                        )}
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">{t('navigator.itemName', 'Name')}</label>
                        <Input
                            placeholder={t('navigator.itemNamePlaceholder', 'e.g. Sprint 12 onboarding')}
                            value={name}
                            onChange={e => setName(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && selectedProcessId && name.trim()) handleCreate();
                            }}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        onClick={handleCreate}
                        disabled={!selectedProcessId || !name.trim() || applyMutation.isPending}
                    >
                        {applyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('navigator.create', 'Create')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
