import { useTranslation } from 'react-i18next';

import { Label, Textarea } from '@flows/ui-kit';

import type { NodeData } from '@lemoncloud/eureka-flows-api';

interface MobileTextInputProps {
    node: NodeData;
    onConfigChange: (key: string, value: unknown) => void;
}

export const MobileTextInput = ({ node, onConfigChange }: MobileTextInputProps) => {
    const { t } = useTranslation(['flows']);
    const text = (node.config?.text as string) || '';

    return (
        <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">
                {t('detailPanel.textContent', 'Text Content')}
            </Label>
            <Textarea
                value={text}
                onChange={e => onConfigChange('text', e.target.value)}
                rows={3}
                placeholder={t('detailPanel.enterText', 'Enter text...')}
                className="text-sm font-mono resize-y min-h-[60px]"
            />
        </div>
    );
};
