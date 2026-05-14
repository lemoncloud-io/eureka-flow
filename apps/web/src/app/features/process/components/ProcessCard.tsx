import { useTranslation } from 'react-i18next';

import { GitBranch, Trash2 } from 'lucide-react';

import { Badge, Button, Card, CardContent } from '@flows/ui-kit';

import type { Process } from '@flows/flows';

interface ProcessCardProps {
    process: Process;
    onClick: (id: string) => void;
    onDelete: (id: string) => void;
}

export const ProcessCard = ({ process, onClick, onDelete }: ProcessCardProps) => {
    const { t } = useTranslation();

    return (
        <Card className="cursor-pointer transition-colors hover:bg-accent/30" onClick={() => onClick(process.id)}>
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
                            <h3 className="truncate font-medium">{process.name}</h3>
                        </div>
                        {process.description && (
                            <p className="mt-1 text-xs text-muted-foreground truncate">{process.description}</p>
                        )}
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={e => {
                            e.stopPropagation();
                            onDelete(process.id);
                        }}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
                <div className="mt-3 flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                        {process.stereo}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                        {process.stages.length} {t('navigator.stages', 'stages')}
                    </span>
                </div>
            </CardContent>
        </Card>
    );
};
