import { Plus, X } from 'lucide-react';

import { Button, Input } from '@flows/ui-kit';

import { KeyInput } from './KeyInput';

import type { ConfigOption } from '../types';

interface ConfigOptionEditorProps {
    options: ConfigOption[];
    onChange: (options: ConfigOption[]) => void;
    disabled?: boolean;
}

/**
 * Choices of a `select` config field. Their labels are shown to the user in the
 * flow editor, so each one carries a language key like every other visible text.
 */
export const ConfigOptionEditor = ({ options, onChange, disabled = false }: ConfigOptionEditorProps) => {
    const update = (index: number, field: keyof ConfigOption, value: string | undefined) => {
        onChange(options.map((opt, i) => (i === index ? { ...opt, [field]: value } : opt)));
    };

    return (
        <div className="flex w-full flex-col gap-1.5 rounded border border-dashed p-2">
            <div className="flex items-center justify-between">
                <span className="eyebrow text-muted-foreground">options</span>
                {!disabled && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2"
                        onClick={() => onChange([...options, { label: '', value: '' }])}
                    >
                        <Plus className="mr-1 h-3 w-3" />
                        추가
                    </Button>
                )}
            </div>

            {options.length === 0 && <p className="text-xs text-muted-foreground">선택지가 없습니다.</p>}

            {options.map((opt, index) => (
                <div key={index} className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                        <Input
                            placeholder="Value"
                            value={opt.value}
                            onChange={e => update(index, 'value', e.target.value)}
                            className="h-7 w-32 text-xs"
                            disabled={disabled}
                        />
                        <Input
                            placeholder="Label"
                            value={opt.label}
                            onChange={e => update(index, 'label', e.target.value)}
                            className="h-7 flex-1 text-xs"
                            disabled={disabled}
                        />
                        {!disabled && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => onChange(options.filter((_, i) => i !== index))}
                            >
                                <X className="h-3.5 w-3.5" />
                            </Button>
                        )}
                    </div>
                    {/* Mirrors the row above — same width and gap — so the key lines up under Label. */}
                    <div className="flex gap-2 pr-9">
                        <div className="w-32 shrink-0" aria-hidden />
                        <div className="flex-1">
                            <KeyInput
                                value={opt.labelEn}
                                onChange={v => update(index, 'labelEn', v)}
                                placeholder="gemini_flash"
                                disabled={disabled}
                            />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};
