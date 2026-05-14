import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';

import { cn } from '@flows/lib/utils';
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
} from '@flows/ui-kit';

import type { CreateStageInput } from '@flows/flows';

interface StageTemplateItemProps {
    stage: CreateStageInput;
    index: number;
    isFirst: boolean;
    isLast: boolean;
    isSelected: boolean;
    onSelect: () => void;
    onRemove: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
}

export const StageTemplateItem = ({
    stage,
    index,
    isFirst,
    isLast,
    isSelected,
    onSelect,
    onRemove,
    onMoveUp,
    onMoveDown,
}: StageTemplateItemProps) => {
    return (
        <div
            className={cn(
                'flex items-center gap-2 rounded-md border p-3 cursor-pointer transition-colors',
                isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/30'
            )}
            onClick={onSelect}
        >
            <span className="text-xs text-muted-foreground w-5 text-center shrink-0">{index + 1}</span>
            <div className="min-w-0 flex-1">
                <span className="text-sm font-medium truncate block">{stage.name || 'Untitled Stage'}</span>
            </div>
            <Badge variant="secondary" className="text-[10px] shrink-0">
                {stage.stereo}
            </Badge>
            {stage.isRequired && (
                <Badge variant="outline" className="text-[10px] shrink-0">
                    required
                </Badge>
            )}
            <div className="flex items-center gap-0.5 shrink-0">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={isFirst}
                    onClick={e => {
                        e.stopPropagation();
                        onMoveUp();
                    }}
                >
                    <ArrowUp className="h-3 w-3" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={isLast}
                    onClick={e => {
                        e.stopPropagation();
                        onMoveDown();
                    }}
                >
                    <ArrowDown className="h-3 w-3" />
                </Button>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={e => e.stopPropagation()}
                        >
                            <Trash2 className="h-3 w-3" />
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={e => e.stopPropagation()}>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete Stage</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will remove the stage from the process template. This action cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={onRemove}
                            >
                                Delete
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    );
};
