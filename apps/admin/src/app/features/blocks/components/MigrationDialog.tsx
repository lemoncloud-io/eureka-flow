import { ArrowRight, Loader2 } from 'lucide-react';

import {
    Badge,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@flows/ui-kit';

import { buildBlockMigrationPlan, useBlockMigration } from '../hooks';

import type { Block } from '../types';

interface MigrationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    blocks: Block[];
}

export const MigrationDialog = ({ open, onOpenChange, blocks }: MigrationDialogProps) => {
    const { progress, run, reset } = useBlockMigration();
    const plan = buildBlockMigrationPlan(blocks);
    const pending = plan.filter(p => !p.alreadyKeyed);
    const finished = !progress.running && progress.total > 0;

    const handleClose = (next: boolean) => {
        if (progress.running) return; // don't close mid-run
        if (!next) reset();
        onOpenChange(next);
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>블록 label을 키로 변환</DialogTitle>
                    <DialogDescription>
                        각 블록의 label을 <code>{'{block_type}'}</code> 키로, 설명을 <code>{'{block_type}_desc'}</code>{' '}
                        키로 교체합니다. 이미 키인 블록은 건너뜁니다. 서버에 즉시 반영되는 작업입니다.
                    </DialogDescription>
                </DialogHeader>

                <div className="max-h-80 overflow-y-auto rounded-md border">
                    {plan.map(item => (
                        <div
                            key={item.id}
                            className="flex items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0"
                        >
                            <span className="w-40 shrink-0 truncate font-medium">{item.name}</span>
                            {item.alreadyKeyed ? (
                                <Badge variant="outline" className="ml-auto">
                                    이미 키
                                </Badge>
                            ) : (
                                <div className="flex flex-1 items-center gap-2 text-muted-foreground">
                                    <span className="truncate">{item.currentLabel}</span>
                                    <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                                    <code className="text-foreground">{item.labelKey}</code>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {progress.total > 0 && (
                    <p className="text-sm text-muted-foreground">
                        {progress.done}/{progress.total} 처리됨
                        {progress.errors.length > 0 && (
                            <span className="text-destructive"> · 실패 {progress.errors.length}건</span>
                        )}
                    </p>
                )}

                <DialogFooter>
                    {finished ? (
                        <Button size="sm" onClick={() => handleClose(false)}>
                            닫기
                        </Button>
                    ) : (
                        <>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleClose(false)}
                                disabled={progress.running}
                            >
                                취소
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => run(blocks)}
                                disabled={progress.running || pending.length === 0}
                            >
                                {progress.running && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                                적용 ({pending.length}개)
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
