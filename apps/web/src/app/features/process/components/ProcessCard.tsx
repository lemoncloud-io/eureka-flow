import { useTranslation } from 'react-i18next';

import { GitBranch, Play, Trash2 } from 'lucide-react';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
    Badge,
    Button,
    Card,
    CardContent,
} from '@flows/ui-kit';

import type { Process } from '@flows/flows';

interface ProcessCardProps {
    process: Process;
    onClick: (id: string) => void;
    onDelete: (id: string) => void;
    onApply?: (id: string) => void;
}

export const ProcessCard = ({ process, onClick, onDelete, onApply }: ProcessCardProps) => {
    const { t } = useTranslation();

    return (
        <Card
            className="cursor-pointer transition-all duration-200 hover:shadow-md hover:border-border/80"
            onClick={() => onClick(process.id)}
        >
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
                            <h3 className="truncate font-medium" title={process.name}>
                                {process.name}
                            </h3>
                        </div>
                        {process.description && (
                            <p className="mt-1 text-xs text-muted-foreground truncate" title={process.description}>
                                {process.description}
                            </p>
                        )}
                    </div>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                                onClick={e => e.stopPropagation()}
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent onClick={e => e.stopPropagation()}>
                            <AlertDialogHeader>
                                <AlertDialogTitle>{t('navigator.deleteProcess', 'Delete Process')}</AlertDialogTitle>
                                <AlertDialogDescription>
                                    {t(
                                        'navigator.deleteProcessConfirm',
                                        'This action cannot be undone. This will permanently delete the process.'
                                    )}
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
                                <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => onDelete(process.id)}
                                >
                                    {t('common.delete', 'Delete')}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
                {process.stages.length > 0 && (
                    <p className="mt-2 text-[11px] text-muted-foreground/60 truncate">
                        {process.stages.map(s => s.name || 'Untitled').join(' → ')}
                    </p>
                )}
                <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">
                            {process.stereo}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                            {process.stages.length} {t('navigator.stages', 'stages')}
                        </span>
                    </div>
                    {onApply && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 gap-1 text-xs text-primary"
                            onClick={e => {
                                e.stopPropagation();
                                onApply(process.id);
                            }}
                        >
                            <Play className="h-3 w-3" />
                            {t('navigator.apply', 'Apply')}
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};
