import { Plus, X } from 'lucide-react';

import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@flows/ui-kit';

import { PORT_TYPE_OPTIONS } from '../types';

import type { Port } from '../types';

interface PortEditorProps {
    label: string;
    ports: Port[];
    onChange: (ports: Port[]) => void;
}

export const PortEditor = ({ label, ports, onChange }: PortEditorProps) => {
    const addPort = () => {
        onChange([...ports, { id: '', label: '', type: 'text' }]);
    };

    const updatePort = (index: number, field: keyof Port, value: string) => {
        const updated = ports.map((port, i) => (i === index ? { ...port, [field]: value } : port));
        onChange(updated);
    };

    const removePort = (index: number) => {
        onChange(ports.filter((_, i) => i !== index));
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">{label}</h3>
                <Button type="button" variant="outline" size="sm" onClick={addPort}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    추가
                </Button>
            </div>
            {ports.length === 0 && <p className="text-sm text-muted-foreground">포트가 없습니다.</p>}
            {ports.map((port, index) => (
                <div key={index} className="flex items-center gap-2">
                    <Input
                        placeholder="ID"
                        value={port.id}
                        onChange={e => updatePort(index, 'id', e.target.value)}
                        className="w-28"
                    />
                    <Input
                        placeholder="Label"
                        value={port.label}
                        onChange={e => updatePort(index, 'label', e.target.value)}
                        className="flex-1"
                    />
                    <Select value={port.type} onValueChange={v => updatePort(index, 'type', v)}>
                        <SelectTrigger className="w-28">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {PORT_TYPE_OPTIONS.map(t => (
                                <SelectItem key={t} value={t}>
                                    {t}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removePort(index)}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            ))}
        </div>
    );
};
