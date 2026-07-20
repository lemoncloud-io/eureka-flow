import {
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
    Textarea,
} from '@flows/ui-kit';

import { STEREO_OPTIONS } from '../types';
import { KeyInput } from './KeyInput';

import type { BlockFormData } from '../types';

interface BlockFormProps {
    data: BlockFormData;
    onChange: (data: BlockFormData) => void;
    disabled?: boolean;
}

export const BlockForm = ({ data, onChange, disabled = false }: BlockFormProps) => {
    const update = <K extends keyof BlockFormData>(field: K, value: BlockFormData[K]) => {
        onChange({ ...data, [field]: value });
    };

    return (
        <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
                <Label>Name</Label>
                <Input value={data.name} onChange={e => update('name', e.target.value)} disabled={disabled} />
            </div>
            <div className="flex flex-col gap-2">
                <Label>Label</Label>
                <Input value={data.label} onChange={e => update('label', e.target.value)} disabled={disabled} />
                <KeyInput
                    value={data.labelEn}
                    onChange={v => update('labelEn', v)}
                    placeholder="input_text"
                    disabled={disabled}
                />
            </div>
            <div className="flex flex-col gap-2">
                <Label>Icon</Label>
                <Input
                    value={data.icon}
                    onChange={e => update('icon', e.target.value)}
                    className="w-20"
                    disabled={disabled}
                />
            </div>
            <div className="flex flex-col gap-2">
                <Label>Stereo</Label>
                <Select
                    value={data.stereo}
                    onValueChange={v => update('stereo', v as BlockFormData['stereo'])}
                    disabled={disabled}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {STEREO_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="flex flex-col gap-2">
                <Label>Process Type</Label>
                <Input
                    value={data.processType}
                    onChange={e => update('processType', e.target.value)}
                    disabled={disabled}
                />
            </div>
            <div className="flex flex-col gap-2">
                <Label>Order</Label>
                <Input
                    type="number"
                    value={data.order}
                    onChange={e => update('order', parseInt(e.target.value, 10) || 0)}
                    disabled={disabled}
                />
            </div>
            <div className="col-span-2 flex flex-col gap-2">
                <Label>Description</Label>
                <Textarea
                    value={data.description}
                    onChange={e => update('description', e.target.value)}
                    rows={3}
                    disabled={disabled}
                />
                <KeyInput
                    value={data.descriptionEn}
                    onChange={v => update('descriptionEn', v)}
                    placeholder="input_text_desc"
                    disabled={disabled}
                />
            </div>
            <div className="flex items-center gap-2">
                <Switch checked={data.isFrontend} onCheckedChange={v => update('isFrontend', v)} disabled={disabled} />
                <Label>Frontend Block</Label>
            </div>
        </div>
    );
};
