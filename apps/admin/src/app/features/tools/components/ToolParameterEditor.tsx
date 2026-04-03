import { useState } from 'react';

import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';

import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch } from '@flows/ui-kit';

import { PARAMETER_TYPE_OPTIONS } from '../consts';

import type { ToolParameter } from '../types';

interface ToolParameterEditorProps {
    parameters: ToolParameter[];
    onChange: (parameters: ToolParameter[]) => void;
    depth?: number;
}

const MAX_DEPTH = 2;

export const ToolParameterEditor = ({ parameters, onChange, depth = 0 }: ToolParameterEditorProps) => {
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

    const addParameter = () => {
        onChange([...parameters, { name: '', type: 'string', description: '', required: false }]);
    };

    const updateParameter = (index: number, updates: Partial<ToolParameter>) => {
        const updated = parameters.map((param, i) => {
            if (i !== index) return param;
            const next = { ...param, ...updates };

            // Clear type-specific fields when type changes
            if (updates.type && updates.type !== param.type) {
                delete next.enum;
                delete next.defaultValue;
                delete next.items;
                delete next.properties;
                if (updates.type === 'array') {
                    next.items = { type: 'string' };
                }
                if (updates.type === 'object') {
                    next.properties = [];
                }
            }

            return next;
        });
        onChange(updated);
    };

    const removeParameter = (index: number) => {
        onChange(parameters.filter((_, i) => i !== index));
        setExpandedRows(prev => {
            const next = new Set(prev);
            next.delete(index);
            return next;
        });
    };

    const toggleExpand = (index: number) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    const hasExpandableContent = (param: ToolParameter) =>
        param.type === 'string' || param.type === 'number' || param.type === 'object' || param.type === 'array';

    return (
        <div className="flex flex-col gap-3">
            {depth === 0 && (
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">Parameters</h3>
                    <Button type="button" variant="outline" size="sm" onClick={addParameter}>
                        <Plus className="mr-1 h-4 w-4" />
                        추가
                    </Button>
                </div>
            )}
            {depth > 0 && (
                <Button type="button" variant="ghost" size="sm" className="self-start" onClick={addParameter}>
                    <Plus className="mr-1 h-3 w-3" />
                    속성 추가
                </Button>
            )}
            {parameters.length === 0 && depth === 0 && (
                <p className="text-sm text-muted-foreground">파라미터가 없습니다.</p>
            )}
            {parameters.map((param, index) => (
                <div key={index} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        {hasExpandableContent(param) ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0"
                                onClick={() => toggleExpand(index)}
                            >
                                {expandedRows.has(index) ? (
                                    <ChevronDown className="h-3 w-3" />
                                ) : (
                                    <ChevronRight className="h-3 w-3" />
                                )}
                            </Button>
                        ) : (
                            <div className="w-6 shrink-0" />
                        )}
                        <Input
                            placeholder="Name"
                            value={param.name}
                            onChange={e => updateParameter(index, { name: e.target.value })}
                            className="w-28"
                        />
                        <Select
                            value={param.type}
                            onValueChange={v => updateParameter(index, { type: v as ToolParameter['type'] })}
                        >
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
                            onChange={e => updateParameter(index, { description: e.target.value })}
                            className="flex-1"
                        />
                        <div className="flex items-center gap-1">
                            <Switch
                                checked={param.required}
                                onCheckedChange={v => updateParameter(index, { required: v })}
                            />
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

                    {/* Expanded: enum, default, nested properties */}
                    {expandedRows.has(index) && (
                        <div className="ml-8 flex flex-col gap-2 rounded-md border border-dashed p-3">
                            {/* Enum (string/number only) */}
                            {(param.type === 'string' || param.type === 'number') && (
                                <div className="flex items-center gap-2">
                                    <span className="w-16 text-xs text-muted-foreground">Enum</span>
                                    <Input
                                        placeholder="콤마로 구분 (e.g. json,csv,xml)"
                                        value={param.enum?.join(',') ?? ''}
                                        onChange={e => {
                                            const val = e.target.value;
                                            const enumValues = val ? val.split(',').map(s => s.trim()) : undefined;
                                            updateParameter(index, { enum: enumValues });
                                        }}
                                        className="flex-1"
                                    />
                                </div>
                            )}

                            {/* Default value (string/number/boolean) */}
                            {(param.type === 'string' || param.type === 'number') && (
                                <div className="flex items-center gap-2">
                                    <span className="w-16 text-xs text-muted-foreground">Default</span>
                                    <Input
                                        placeholder="기본값"
                                        value={param.defaultValue ?? ''}
                                        onChange={e => updateParameter(index, { defaultValue: e.target.value })}
                                        className="flex-1"
                                    />
                                </div>
                            )}

                            {/* Array items type */}
                            {param.type === 'array' && (
                                <div className="flex items-center gap-2">
                                    <span className="w-16 text-xs text-muted-foreground">Items</span>
                                    <Select
                                        value={param.items?.type ?? 'string'}
                                        onValueChange={v =>
                                            updateParameter(index, { items: { type: v as ToolParameter['type'] } })
                                        }
                                    >
                                        <SelectTrigger className="w-32">
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
                                </div>
                            )}

                            {/* Nested object properties */}
                            {param.type === 'object' && depth < MAX_DEPTH && (
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs text-muted-foreground">Properties</span>
                                    <ToolParameterEditor
                                        parameters={param.properties ?? []}
                                        onChange={props => updateParameter(index, { properties: props })}
                                        depth={depth + 1}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};
