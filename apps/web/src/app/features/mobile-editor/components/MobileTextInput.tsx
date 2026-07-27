import { useTranslation } from 'react-i18next';

import { Label, Textarea } from '@flows/ui-kit';

import type { GraphNode } from '@flows/flows';

interface MobileTextInputProps {
    node: GraphNode;
    onConfigChange: (key: string, value: unknown) => void;
}

export const MobileTextInput = ({ node, onConfigChange }: MobileTextInputProps) => {
    const { t } = useTranslation(['flows']);
    const text = (node.config?.text as string) || '';

    return (
        <div>
            <Label className="text-sm font-medium mb-1.5 block">{t('mobile.value', '값')}</Label>
            <Textarea
                value={text}
                onChange={e => onConfigChange('text', e.target.value)}
                rows={4}
                placeholder={t('mobile.valuePlaceholder', '여기에 내용을 입력하세요.')}
                className="text-sm resize-y min-h-[80px]"
            />
        </div>
    );
};
