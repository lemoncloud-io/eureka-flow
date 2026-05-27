import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { GitBranch, Loader2, Play, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

import { useApplyProcessMutation, useDeleteProcessMutation, useProcesses } from '@flows/flows';
import { Button, Card, CardContent, Input } from '@flows/ui-kit';

import { ProcessCard } from '../components/ProcessCard';

export const ProcessListPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { data: processesData, isLoading } = useProcesses({ staleTime: 0 });
    const deleteMutation = useDeleteProcessMutation();
    const applyMutation = useApplyProcessMutation();
    const [applyTarget, setApplyTarget] = useState<string | null>(null);
    const [applyItemName, setApplyItemName] = useState('');

    const processes = processesData?.data ?? [];

    const handleDelete = (id: string) => {
        deleteMutation.mutate(id, {
            onSuccess: () => toast.success(t('navigator.processDeleted', 'Process deleted')),
        });
    };

    const handleApply = (processId: string) => {
        setApplyTarget(processId);
        setApplyItemName('');
    };

    const handleApplySubmit = () => {
        if (!applyTarget || !applyItemName.trim()) return;
        applyMutation.mutate(
            { processId: applyTarget, input: { name: applyItemName.trim(), thumbnailUrl: '', processId: applyTarget } },
            {
                onSuccess: result => {
                    setApplyTarget(null);
                    navigate(`/items/${result.data.id}`);
                    toast.success(t('navigator.itemCreated', 'Item created from process'));
                },
            }
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <GitBranch className="h-6 w-6 text-primary" />
                    <h1 className="text-2xl font-bold">{t('navigator.processes', 'Processes')}</h1>
                    {processes.length > 0 && (
                        <span className="text-sm text-muted-foreground">({processes.length})</span>
                    )}
                </div>
                <Button size="sm" onClick={() => navigate('/processes/new')} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    {t('navigator.createProcess', 'Create Process')}
                </Button>
            </div>

            {isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
                    ))}
                </div>
            ) : processes.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="p-8 text-center">
                        <p className="text-muted-foreground">
                            {t('navigator.noProcessesYet', 'No process templates yet. Create your first workflow.')}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {applyTarget && (
                        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                            <Input
                                value={applyItemName}
                                onChange={e => setApplyItemName(e.target.value)}
                                placeholder={t('navigator.itemNamePlaceholder', 'Enter item name...')}
                                className="flex-1"
                                autoFocus
                                onKeyDown={e => {
                                    if (e.key === 'Enter') handleApplySubmit();
                                    if (e.key === 'Escape') setApplyTarget(null);
                                }}
                            />
                            <Button
                                size="sm"
                                onClick={handleApplySubmit}
                                disabled={!applyItemName.trim() || applyMutation.isPending}
                                className="gap-1.5"
                            >
                                {applyMutation.isPending ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Play className="h-3.5 w-3.5" />
                                )}
                                {t('navigator.createItem', 'Create Item')}
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setApplyTarget(null)}
                            >
                                <X className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {processes.map(p => (
                            <ProcessCard
                                key={p.id}
                                process={p}
                                onClick={id => navigate(`/processes/${id}`)}
                                onDelete={handleDelete}
                                onApply={handleApply}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};
