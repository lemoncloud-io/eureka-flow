import { useEffect, useState } from 'react';

import { toast } from 'sonner';

import { Button } from '@flows/ui-kit';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@flows/ui-kit';
import { Input } from '@flows/ui-kit';
import { Label } from '@flows/ui-kit';
import { ScrollArea } from '@flows/ui-kit';
import { Switch } from '@flows/ui-kit';
import { Textarea } from '@flows/ui-kit';

import { useSkillStore } from '../stores';
import { ToolSelector } from './ToolSelector';

import type { Skill, SkillFormData } from '../types';

const EMPTY_FORM: SkillFormData = {
    name: '',
    label: '',
    icon: '🔧',
    description: '',
    prompt: '',
    toolIds: [],
    isEnabled: true,
};

interface SkillFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editTarget?: Skill | null;
}

export const SkillFormDialog = ({ open, onOpenChange, editTarget }: SkillFormDialogProps) => {
    const addSkill = useSkillStore(s => s.addSkill);
    const updateSkill = useSkillStore(s => s.updateSkill);

    const [form, setForm] = useState<SkillFormData>(EMPTY_FORM);

    useEffect(() => {
        if (open) {
            setForm(
                editTarget
                    ? {
                          name: editTarget.name,
                          label: editTarget.label,
                          icon: editTarget.icon,
                          description: editTarget.description,
                          prompt: editTarget.prompt,
                          toolIds: [...editTarget.toolIds],
                          isEnabled: editTarget.isEnabled,
                      }
                    : EMPTY_FORM
            );
        }
    }, [open, editTarget]);

    const update = <K extends keyof SkillFormData>(field: K, value: SkillFormData[K]) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = () => {
        if (!form.name.trim() || !form.label.trim()) {
            toast.error('Name과 Label은 필수입니다.');
            return;
        }

        if (editTarget) {
            updateSkill(editTarget.id, form);
            toast.success('Skill이 수정되었습니다.');
        } else {
            addSkill(form);
            toast.success('Skill이 추가되었습니다.');
        }
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{editTarget ? 'Skill 수정' : '새 Skill 추가'}</DialogTitle>
                </DialogHeader>
                <ScrollArea className="max-h-[60vh]">
                    <div className="grid grid-cols-2 gap-4 p-1">
                        <div className="flex flex-col gap-2">
                            <Label>Name</Label>
                            <Input
                                value={form.name}
                                onChange={e => update('name', e.target.value)}
                                placeholder="code_review"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label>Label</Label>
                            <Input
                                value={form.label}
                                onChange={e => update('label', e.target.value)}
                                placeholder="코드 리뷰"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label>Icon</Label>
                            <Input value={form.icon} onChange={e => update('icon', e.target.value)} className="w-20" />
                        </div>
                        <div className="flex items-center gap-2 self-end">
                            <Switch checked={form.isEnabled} onCheckedChange={v => update('isEnabled', v)} />
                            <Label>활성화</Label>
                        </div>
                        <div className="col-span-2 flex flex-col gap-2">
                            <Label>Description</Label>
                            <Textarea
                                value={form.description}
                                onChange={e => update('description', e.target.value)}
                                rows={2}
                                placeholder="Skill에 대한 설명"
                            />
                        </div>
                        <div className="col-span-2 flex flex-col gap-2">
                            <Label>Prompt (시스템 지시)</Label>
                            <Textarea
                                value={form.prompt}
                                onChange={e => update('prompt', e.target.value)}
                                rows={6}
                                placeholder="LLM에게 전달할 기본 프롬프트를 작성하세요"
                            />
                        </div>
                        <div className="col-span-2">
                            <ToolSelector selectedIds={form.toolIds} onChange={ids => update('toolIds', ids)} />
                        </div>
                    </div>
                </ScrollArea>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        취소
                    </Button>
                    <Button onClick={handleSubmit}>{editTarget ? '수정' : '추가'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
