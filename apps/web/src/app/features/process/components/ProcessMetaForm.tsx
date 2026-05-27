import { useTranslation } from 'react-i18next';

import { Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@flows/ui-kit';

interface ProcessMetaFormProps {
    name: string;
    description: string;
    stereo: 'linear' | 'flexible';
    onNameChange: (v: string) => void;
    onDescriptionChange: (v: string) => void;
    onStereoChange: (v: 'linear' | 'flexible') => void;
    isNew: boolean;
}

export const ProcessMetaForm = ({
    name,
    description,
    stereo,
    onNameChange,
    onDescriptionChange,
    onStereoChange,
    isNew,
}: ProcessMetaFormProps) => {
    const { t } = useTranslation();

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label>{t('navigator.processName', 'Name')}</Label>
                <Input
                    value={name}
                    onChange={e => onNameChange(e.target.value)}
                    placeholder="e.g. 패션 상품 멀티몰 등록"
                />
            </div>
            <div className="space-y-2">
                <Label>{t('navigator.processDescription', 'Description')}</Label>
                <Textarea
                    value={description}
                    onChange={e => onDescriptionChange(e.target.value)}
                    rows={2}
                    className="resize-none"
                />
            </div>
            <div className="space-y-2">
                <Label>{t('navigator.processStereo', 'Type')}</Label>
                <Select
                    value={stereo}
                    onValueChange={v => onStereoChange(v as 'linear' | 'flexible')}
                    disabled={!isNew}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="linear">Linear (sequential)</SelectItem>
                        <SelectItem value="flexible">Flexible (parallel)</SelectItem>
                    </SelectContent>
                </Select>
                {!isNew && (
                    <p className="text-xs text-muted-foreground">
                        {t('navigator.stereoImmutable', 'Type cannot be changed after creation.')}
                    </p>
                )}
            </div>
        </div>
    );
};
