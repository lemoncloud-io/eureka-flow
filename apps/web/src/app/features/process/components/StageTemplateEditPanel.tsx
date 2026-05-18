import { useTranslation } from 'react-i18next';

import { useActors, useTools } from '@flows/flows';
import {
    Checkbox,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    Switch,
    Textarea,
} from '@flows/ui-kit';

import type { LocalStage } from '../pages/ProcessEditorPage';

interface StageTemplateEditPanelProps {
    stage: LocalStage | null;
    stageIndex: number | null;
    allStages: LocalStage[];
    onChange: (index: number, updated: LocalStage) => void;
    onClose: () => void;
}

export const StageTemplateEditPanel = ({
    stage,
    stageIndex,
    allStages,
    onChange,
    onClose,
}: StageTemplateEditPanelProps) => {
    const { t } = useTranslation();
    const { data: actorsData } = useActors();
    const { data: toolsData } = useTools();
    const actors = actorsData?.data?.filter(a => a.isActive) ?? [];
    const activeTools = toolsData?.data?.filter(tl => tl.isActive) ?? [];

    const handleChange = (partial: Partial<LocalStage>) => {
        if (stage === null || stageIndex === null) return;
        onChange(stageIndex, { ...stage, ...partial });
    };

    const otherStages = allStages.filter(s => s.clientId !== stage?.clientId);

    return (
        <Sheet open={stage !== null} onOpenChange={open => !open && onClose()}>
            <SheetContent side="right" className="w-full sm:w-[400px] overflow-y-auto p-0">
                {stage && (
                    <>
                        <SheetHeader className="px-6 pt-6 pb-4">
                            <SheetTitle>{t('navigator.editStage', 'Edit Stage')}</SheetTitle>
                        </SheetHeader>
                        <div className="px-6 pb-6 space-y-4">
                            <div className="space-y-2">
                                <Label>{t('navigator.stageName', 'Name')}</Label>
                                <Input value={stage.name} onChange={e => handleChange({ name: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>{t('navigator.guideText', 'Guide Text')}</Label>
                                <Textarea
                                    value={stage.guideText ?? ''}
                                    onChange={e => handleChange({ guideText: e.target.value || undefined })}
                                    rows={2}
                                    className="resize-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>{t('navigator.actionLabel', 'Action Label')}</Label>
                                <Input
                                    value={stage.actionLabel ?? ''}
                                    onChange={e => handleChange({ actionLabel: e.target.value || undefined })}
                                    placeholder="e.g. 작업 열기"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>{t('navigator.actor', 'Actor')}</Label>
                                <Select
                                    value={stage.actorId ?? '__none__'}
                                    onValueChange={v => handleChange({ actorId: v === '__none__' ? undefined : v })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('navigator.selectActor', 'Select Actor')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none__">{t('navigator.none', 'None')}</SelectItem>
                                        {actors.map(a => (
                                            <SelectItem key={a.id} value={a.id}>
                                                {a.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>{t('navigator.tool', 'Tool')}</Label>
                                <Select
                                    value={stage.toolId ?? '__none__'}
                                    onValueChange={v => handleChange({ toolId: v === '__none__' ? undefined : v })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('navigator.selectTool', 'Select Tool')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none__">{t('navigator.none', 'None')}</SelectItem>
                                        {activeTools.map(tl => (
                                            <SelectItem key={tl.id} value={tl.id}>
                                                {tl.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-center justify-between">
                                <Label>{t('navigator.isRequired', 'Required')}</Label>
                                <Switch
                                    checked={stage.isRequired}
                                    onCheckedChange={v => handleChange({ isRequired: v })}
                                />
                            </div>
                            {otherStages.length > 0 && (
                                <div className="space-y-2">
                                    <Label>{t('navigator.dependencies', 'Dependencies')}</Label>
                                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                        {otherStages.map(s => {
                                            const isChecked = (stage.dependencyStageIds ?? []).includes(s.clientId);
                                            return (
                                                <label
                                                    key={s.clientId}
                                                    className="flex items-center gap-2 text-sm cursor-pointer"
                                                >
                                                    <Checkbox
                                                        checked={isChecked}
                                                        onCheckedChange={checked => {
                                                            const deps = stage.dependencyStageIds ?? [];
                                                            handleChange({
                                                                dependencyStageIds: checked
                                                                    ? [...deps, s.clientId]
                                                                    : deps.filter(d => d !== s.clientId),
                                                            });
                                                        }}
                                                    />
                                                    <span>{s.name || 'Untitled Stage'}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
};
