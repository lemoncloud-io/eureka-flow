import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Plus } from 'lucide-react';

import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@flows/ui-kit';

import { StageTemplateItem } from './StageTemplateItem';

import type { LocalStage } from '../pages/ProcessEditorPage';
import type { CreateStageInput } from '@flows/flows';

interface StageTemplateListProps {
    stages: LocalStage[];
    selectedIndex: number | null;
    onAdd: (stereo: CreateStageInput['stereo']) => void;
    onRemove: (index: number) => void;
    onReorder: (index: number, direction: 'up' | 'down') => void;
    onSelect: (index: number | null) => void;
}

export const StageTemplateList = ({
    stages,
    selectedIndex,
    onAdd,
    onRemove,
    onReorder,
    onSelect,
}: StageTemplateListProps) => {
    const { t } = useTranslation();
    const [addStereo, setAddStereo] = useState<CreateStageInput['stereo']>('simple');

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">
                    {t('navigator.stages', 'Stages')} ({stages.length})
                </h3>
            </div>

            <div className="space-y-2">
                {stages.map((stage, i) => (
                    <StageTemplateItem
                        key={stage.clientId}
                        stage={stage}
                        index={i}
                        isFirst={i === 0}
                        isLast={i === stages.length - 1}
                        isSelected={selectedIndex === i}
                        onSelect={() => onSelect(selectedIndex === i ? null : i)}
                        onRemove={() => onRemove(i)}
                        onMoveUp={() => onReorder(i, 'up')}
                        onMoveDown={() => onReorder(i, 'down')}
                    />
                ))}
            </div>

            <div className="flex items-center gap-2">
                <Select value={addStereo} onValueChange={v => setAddStereo(v as CreateStageInput['stereo'])}>
                    <SelectTrigger className="w-36 h-8 text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="simple">Simple</SelectItem>
                        <SelectItem value="iterative">Iterative</SelectItem>
                        <SelectItem value="flow">Flow</SelectItem>
                    </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => onAdd(addStereo)} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    {t('navigator.addStage', 'Add Stage')}
                </Button>
            </div>
        </div>
    );
};
