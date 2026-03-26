import { Plus, X } from 'lucide-react';

import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch } from '@flows/ui-kit';

import { PARAMETER_TYPE_OPTIONS } from '../consts';

import type { ToolParameter } from '../types';

interface ToolParameterEditorProps {
    parameters: ToolParameter[];
    onChange: (parameters: ToolParameter[]) => void;
}

export const ToolParameterEditor = ({ parameters, onChange }: ToolParameterEditorProps) => {
    const addParameter = () => {
        onChange([...parameters, { name: '', type: 'string', description: '', required: false }]);
    };

    const updateParameter = (index: number, field: keyof ToolParameter, value: string | boolean) => {
        const updated = parameters.map((param, i) => (i === index ? { ...param, [field]: value } : param));
        onChange(updated);
    };

    const removeParameter = (index: number) => {
        onChange(parameters.filter((_, i) => i !== index));
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Parameters</h3>
                <Button type="button" variant="outline" size="sm" onClick={addParameter}>
                    <Plus className="mr-1 h-4 w-4" />
                    추가
                </Button>
            </div>
            {parameters.length === 0 && <p className="text-sm text-muted-foreground">파라미터가 없습니다.</p>}
            {parameters.map((param, index) => (
                <div key={index} className="flex items-center gap-2">
                    <Input
                        placeholder="Name"
                        value={param.name}
                        onChange={e => updateParameter(index, 'name', e.target.value)}
                        className="w-28"
                    />
                    <Select value={param.type} onValueChange={v => updateParameter(index, 'type', v)}>
                        <SelectTrigger className="w-28">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {PARAMETER_TYPE_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Input
                        placeholder="Description"
                        value={param.description}
                        onChange={e => updateParameter(index, 'description', e.target.value)}
                        className="flex-1"
                    />
                    <div className="flex items-center gap-1">
                        <Switch checked={param.required} onCheckedChange={v => updateParameter(index, 'required', v)} />
                        <span className="text-xs text-muted-foreground">필수</span>
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => removeParameter(index)}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            ))}
        </div>
    );
};
