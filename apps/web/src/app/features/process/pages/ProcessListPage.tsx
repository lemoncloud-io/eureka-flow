import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { GitBranch, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { useDeleteProcessMutation, useProcesses } from '@flows/flows';
import { Button, Card, CardContent } from '@flows/ui-kit';

import { ProcessCard } from '../components/ProcessCard';

export const ProcessListPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { data: processesData, isLoading } = useProcesses();
    const deleteMutation = useDeleteProcessMutation();

    const processes = processesData?.data ?? [];

    const handleDelete = (id: string) => {
        deleteMutation.mutate(id, {
            onSuccess: () => toast.success(t('navigator.processDeleted', 'Process deleted')),
        });
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
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {processes.map(p => (
                        <ProcessCard
                            key={p.id}
                            process={p}
                            onClick={id => navigate(`/processes/${id}`)}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
