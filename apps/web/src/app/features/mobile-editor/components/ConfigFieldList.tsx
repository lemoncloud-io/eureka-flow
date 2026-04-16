import { Input, Label, Switch, Textarea } from '@flows/ui-kit';

import { MobileFileField } from './MobileFileField';

import type { NodeConfigItem } from '@lemoncloud/eureka-flows-api';

interface ConfigFieldListProps {
    fields: NodeConfigItem[];
    config: Record<string, unknown>;
    onConfigChange: (key: string, value: unknown) => void;
    /** Block type — used to filter redundant fields for input-image/input-text */
    blockType?: string;
}

export const ConfigFieldList = ({ fields, config, onConfigChange, blockType }: ConfigFieldListProps) => {
    const isInputSpecial = blockType === 'input-image' || blockType === 'input-text';

    return (
        <>
            {fields
                .filter(f => {
                    if (isInputSpecial) return f.type !== 'file' && f.type !== 'separator';
                    return true;
                })
                .map(field => {
                    const value = config?.[field.key] ?? '';

                    if (field.type === 'separator') {
                        return (
                            <div key={field.key} className="flex items-center gap-2 py-1">
                                <div className="flex-1 h-px bg-border/50" />
                                {field.label && (
                                    <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                                        {field.label}
                                    </span>
                                )}
                                <div className="flex-1 h-px bg-border/50" />
                            </div>
                        );
                    }

                    return (
                        <div key={field.key}>
                            <Label className="text-xs text-muted-foreground mb-1.5 block">
                                {field.label || field.key}
                            </Label>

                            {field.type === 'boolean' || field.type === 'checkbox' ? (
                                <Switch checked={!!value} onCheckedChange={v => onConfigChange(field.key, v)} />
                            ) : field.type === 'select' && field.options ? (
                                <select
                                    value={String(value)}
                                    onChange={e => onConfigChange(field.key, e.target.value)}
                                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                >
                                    {field.options.map(opt => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            ) : field.type === 'file' ? (
                                <MobileFileField value={String(value)} onChange={v => onConfigChange(field.key, v)} />
                            ) : field.type === 'textarea' ? (
                                <Textarea
                                    value={String(value)}
                                    onChange={e => onConfigChange(field.key, e.target.value)}
                                    rows={4}
                                    className="text-sm"
                                />
                            ) : field.type === 'number' ? (
                                <Input
                                    type="number"
                                    value={String(value)}
                                    onChange={e => onConfigChange(field.key, Number(e.target.value))}
                                    className="h-10"
                                />
                            ) : (
                                <Input
                                    value={String(value)}
                                    onChange={e => onConfigChange(field.key, e.target.value)}
                                    className="h-10"
                                />
                            )}
                        </div>
                    );
                })}
        </>
    );
};
