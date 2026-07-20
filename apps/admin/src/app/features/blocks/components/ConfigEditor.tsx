import { Plus, X } from 'lucide-react';

import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@flows/ui-kit';

import { CONFIG_TYPE_OPTIONS } from '../types';
import { ConfigOptionEditor } from './ConfigOptionEditor';
import { KeyInput } from './KeyInput';

import type { ConfigItem, ConfigOption } from '../types';

interface ConfigEditorProps {
    configs: ConfigItem[];
    onChange: (configs: ConfigItem[]) => void;
    disabled?: boolean;
}

const EMPTY_CONFIG: ConfigItem = {
    key: '',
    type: 'text',
    label: '',
};

type EditableConfigField = 'key' | 'type' | 'label' | 'labelEn' | 'placeholder' | 'placeholderEn' | 'defaultValue';

export const ConfigEditor = ({ configs, onChange, disabled = false }: ConfigEditorProps) => {
    const addConfig = () => {
        onChange([...configs, { ...EMPTY_CONFIG }]);
    };

    const updateConfig = (index: number, field: EditableConfigField, value: string | undefined) => {
        const updated = configs.map((cfg, i) => (i === index ? { ...cfg, [field]: value } : cfg));
        onChange(updated);
    };

    const removeConfig = (index: number) => {
        onChange(configs.filter((_, i) => i !== index));
    };

    const setOptions = (index: number, options: ConfigOption[]) => {
        onChange(configs.map((cfg, i) => (i === index ? { ...cfg, options } : cfg)));
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Config</h3>
                {!disabled && (
                    <Button type="button" variant="outline" size="sm" onClick={addConfig}>
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        추가
                    </Button>
                )}
            </div>
            {configs.length === 0 && <p className="text-sm text-muted-foreground">설정 항목이 없습니다.</p>}
            {configs.map((cfg, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                    <Input
                        placeholder="Key"
                        value={cfg.key}
                        onChange={e => updateConfig(index, 'key', e.target.value)}
                        className="w-32"
                        disabled={disabled}
                    />
                    <Select value={cfg.type} onValueChange={v => updateConfig(index, 'type', v)} disabled={disabled}>
                        <SelectTrigger className="w-28">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {CONFIG_TYPE_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Input
                        placeholder="Label"
                        value={cfg.label}
                        onChange={e => updateConfig(index, 'label', e.target.value)}
                        className="flex-1"
                        disabled={disabled}
                    />
                    <Input
                        placeholder="Default Value"
                        value={cfg.defaultValue ?? ''}
                        onChange={e => updateConfig(index, 'defaultValue', e.target.value)}
                        className="w-40"
                        disabled={disabled}
                    />
                    {!disabled && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => removeConfig(index)}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                    <div className="w-full">
                        <KeyInput
                            value={cfg.labelEn}
                            onChange={v => updateConfig(index, 'labelEn', v)}
                            placeholder="prompt"
                            disabled={disabled}
                        />
                    </div>
                    <Input
                        placeholder="Placeholder"
                        value={cfg.placeholder ?? ''}
                        onChange={e => updateConfig(index, 'placeholder', e.target.value || undefined)}
                        className="w-full"
                        disabled={disabled}
                    />
                    <div className="w-full">
                        <KeyInput
                            value={cfg.placeholderEn}
                            onChange={v => updateConfig(index, 'placeholderEn', v)}
                            placeholder="prompt_hint"
                            disabled={disabled}
                        />
                    </div>
                    {cfg.type === 'select' && (
                        <ConfigOptionEditor
                            options={cfg.options ?? []}
                            onChange={options => setOptions(index, options)}
                            disabled={disabled}
                        />
                    )}
                </div>
            ))}
        </div>
    );
};
