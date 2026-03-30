import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Plus } from 'lucide-react';
import { toast } from 'sonner';

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
    Button,
} from '@flows/ui-kit';

import { BlockTable } from '../components/BlockTable';
import { useBlockStore } from '../stores';

import type { BlockStereo } from '../types';

const TABS: { label: string; value: BlockStereo | 'all' }[] = [
    { label: '전체', value: 'all' },
    { label: 'Input', value: 'input' },
    { label: 'Process', value: 'process' },
    { label: 'Output', value: 'output' },
];

export const BlockListPage = () => {
    const navigate = useNavigate();
    const blocks = useBlockStore(s => s.blocks);
    const deleteBlock = useBlockStore(s => s.deleteBlock);

    const [activeTab, setActiveTab] = useState<BlockStereo | 'all'>('all');
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

    const filteredBlocks = useMemo(() => {
        const sorted = [...blocks].sort((a, b) => a.order - b.order);
        if (activeTab === 'all') return sorted;
        return sorted.filter(b => b.stereo === activeTab);
    }, [blocks, activeTab]);

    const deleteTargetBlock = blocks.find(b => b.id === deleteTarget);

    const handleDelete = () => {
        if (!deleteTarget) return;
        deleteBlock(deleteTarget);
        toast.success('블록이 삭제되었습니다.');
        setDeleteTarget(null);
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-foreground">블록 관리</h1>
                <Button size="sm" onClick={() => navigate('/blocks/new')}>
                    <Plus className="mr-1.5 h-4 w-4" />새 블록 추가
                </Button>
            </div>

            <div className="flex gap-1 border-b">
                {TABS.map(tab => (
                    <button
                        key={tab.value}
                        onClick={() => setActiveTab(tab.value)}
                        className={cn(
                            'px-4 py-2 text-sm font-medium transition-colors',
                            activeTab === tab.value
                                ? 'border-b-2 border-primary text-primary'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <BlockTable blocks={filteredBlocks} onDelete={setDeleteTarget} />

            <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>블록을 삭제하시겠습니까?</AlertDialogTitle>
                        <AlertDialogDescription>
                            &quot;{deleteTargetBlock?.name}&quot; 블록을 삭제합니다. 이 작업은 되돌릴 수 없습니다.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>취소</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>삭제</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};
