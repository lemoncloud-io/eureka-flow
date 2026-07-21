import { useState } from 'react';

import { Plus } from 'lucide-react';
import { toast } from 'sonner';

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
import { Button } from '@flows/ui-kit';

import { SkillFormDialog } from '../components/SkillFormDialog';
import { SkillListTable } from '../components/SkillListTable';
import { useSkillStore } from '../stores';

import type { Skill } from '../types';

export const SkillsPage = () => {
    const skills = useSkillStore(s => s.skills);
    const deleteSkill = useSkillStore(s => s.deleteSkill);

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<Skill | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

    const handleEdit = (skill: Skill) => {
        setEditTarget(skill);
        setDialogOpen(true);
    };

    const handleAdd = () => {
        setEditTarget(null);
        setDialogOpen(true);
    };

    const handleDelete = () => {
        if (!deleteTarget) return;
        deleteSkill(deleteTarget);
        toast.success('Skill이 삭제되었습니다.');
        setDeleteTarget(null);
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold tracking-tight text-foreground">Skills</h1>
                <Button size="sm" onClick={handleAdd}>
                    <Plus className="mr-1 h-4 w-4" />새 Skill 추가
                </Button>
            </div>

            <SkillListTable skills={skills} onEdit={handleEdit} onDelete={setDeleteTarget} />

            <SkillFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editTarget={editTarget} />

            <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Skill을 삭제하시겠습니까?</AlertDialogTitle>
                        <AlertDialogDescription>
                            이 작업은 되돌릴 수 없습니다. Skill이 영구적으로 삭제됩니다.
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
