import { useMemo, useState } from 'react';

import { Plus, Search } from 'lucide-react';
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
} from '@flows/ui-kit';
import { Button, Input } from '@flows/ui-kit';

import { ToolFormDialog } from '../components/ToolFormDialog';
import { ToolListTable } from '../components/ToolListTable';
import { TOOL_CATEGORY_OPTIONS } from '../consts';
import { useToolStore } from '../stores';

import type { Tool, ToolCategory } from '../types';

const TABS: { label: string; value: ToolCategory | 'all' }[] = [
    { label: '전체', value: 'all' as const },
    ...TOOL_CATEGORY_OPTIONS,
];

export const ToolsPage = () => {
    const tools = useToolStore(s => s.tools);
    const deleteTool = useToolStore(s => s.deleteTool);

    const [activeTab, setActiveTab] = useState<ToolCategory | 'all'>('all');
    const [search, setSearch] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<Tool | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

    const filteredTools = useMemo(() => {
        let result = [...tools];
        if (activeTab !== 'all') {
            result = result.filter(t => t.category === activeTab);
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(
                t =>
                    t.name.toLowerCase().includes(q) ||
                    t.label.toLowerCase().includes(q) ||
                    t.description.toLowerCase().includes(q)
            );
        }
        return result;
    }, [tools, activeTab, search]);

    const handleEdit = (tool: Tool) => {
        setEditTarget(tool);
        setDialogOpen(true);
    };

    const handleAdd = () => {
        setEditTarget(null);
        setDialogOpen(true);
    };

    const handleDelete = () => {
        if (!deleteTarget) return;
        deleteTool(deleteTarget);
        toast.success('Tool이 삭제되었습니다.');
        setDeleteTarget(null);
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-foreground">Tools</h1>
                <Button size="sm" onClick={handleAdd}>
                    <Plus className="mr-1 h-4 w-4" />새 Tool 추가
                </Button>
            </div>

            <div className="flex items-center gap-4">
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
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="검색..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-60 pl-9"
                    />
                </div>
            </div>

            <ToolListTable tools={filteredTools} onEdit={handleEdit} onDelete={setDeleteTarget} />

            <ToolFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editTarget={editTarget} />

            <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Tool을 삭제하시겠습니까?</AlertDialogTitle>
                        <AlertDialogDescription>
                            이 작업은 되돌릴 수 없습니다. Tool이 영구적으로 삭제됩니다.
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
