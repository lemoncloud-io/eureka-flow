import { useEffect, useState } from 'react';

import { toast } from 'sonner';

import { Button } from '@flows/ui-kit';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@flows/ui-kit';
import { Input } from '@flows/ui-kit';
import { Label } from '@flows/ui-kit';
import { ScrollArea } from '@flows/ui-kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@flows/ui-kit';
import { Switch } from '@flows/ui-kit';
import { Textarea } from '@flows/ui-kit';

import { TOOL_CATEGORY_OPTIONS } from '../consts';
import { useToolStore } from '../stores';
import { ToolParameterEditor } from './ToolParameterEditor';

import type { Tool, ToolFormData } from '../types';

const EMPTY_FORM: ToolFormData = {
    name: '',
    label: '',
    icon: '🔧',
    category: 'custom',
    description: '',
    parameters: [],
    isEnabled: true,
};

interface ToolFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editTarget?: Tool | null;
}

export const ToolFormDialog = ({ open, onOpenChange, editTarget }: ToolFormDialogProps) => {
    const addTool = useToolStore(s => s.addTool);
    const updateTool = useToolStore(s => s.updateTool);

    const [form, setForm] = useState<ToolFormData>(EMPTY_FORM);

    useEffect(() => {
        if (open) {
            setForm(
                editTarget
                    ? {
                          name: editTarget.name,
                          label: editTarget.label,
                          icon: editTarget.icon,
                          category: editTarget.category,
                          description: editTarget.description,
                          parameters: editTarget.parameters,
                          isEnabled: editTarget.isEnabled,
                      }
                    : EMPTY_FORM
            );
        }
    }, [open, editTarget]);

    const update = <K extends keyof ToolFormData>(field: K, value: ToolFormData[K]) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = () => {
        if (!form.name.trim() || !form.label.trim()) {
            toast.error('Name과 Label은 필수입니다.');
            return;
        }

        if (editTarget) {
            updateTool(editTarget.id, form);
            toast.success('Tool이 수정되었습니다.');
        } else {
            addTool(form);
            toast.success('Tool이 추가되었습니다.');
        }
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{editTarget ? 'Tool 수정' : '새 Tool 추가'}</DialogTitle>
                </DialogHeader>
                <ScrollArea className="max-h-[60vh]">
                    <div className="grid grid-cols-2 gap-4 p-1">
                        <div className="flex flex-col gap-2">
                            <Label>Name</Label>
                            <Input
                                value={form.name}
                                onChange={e => update('name', e.target.value)}
                                placeholder="read_file"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label>Label</Label>
                            <Input
                                value={form.label}
                                onChange={e => update('label', e.target.value)}
                                placeholder="파일 읽기"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label>Icon</Label>
                            <Input value={form.icon} onChange={e => update('icon', e.target.value)} className="w-20" />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label>Category</Label>
                            <Select
                                value={form.category}
                                onValueChange={v => update('category', v as ToolFormData['category'])}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {TOOL_CATEGORY_OPTIONS.map(opt => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="col-span-2 flex flex-col gap-2">
                            <Label>Description (LLM Context)</Label>
                            <Textarea
                                value={form.description}
                                onChange={e => update('description', e.target.value)}
                                rows={4}
                                placeholder="LLM이 tool_use 시 참조하는 설명을 작성하세요"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch checked={form.isEnabled} onCheckedChange={v => update('isEnabled', v)} />
                            <Label>활성화</Label>
                        </div>
                        <div className="col-span-2">
                            <ToolParameterEditor
                                parameters={form.parameters}
                                onChange={params => update('parameters', params)}
                            />
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
