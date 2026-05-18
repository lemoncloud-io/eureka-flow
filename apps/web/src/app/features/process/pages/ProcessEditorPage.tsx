import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { ArrowLeft, Loader2, Play, Save, X } from 'lucide-react';
import { toast } from 'sonner';

import { useApplyProcessMutation, useCreateProcessMutation, useProcess, useUpdateProcessMutation } from '@flows/flows';
import { Button, Input, Separator } from '@flows/ui-kit';

import { ProcessMetaForm } from '../components/ProcessMetaForm';
import { StageTemplateEditPanel } from '../components/StageTemplateEditPanel';
import { StageTemplateList } from '../components/StageTemplateList';

import type { CreateStageInput } from '@flows/flows';

/** Local stage with stable clientId for React keys and dependency tracking */
export interface LocalStage extends CreateStageInput {
    clientId: string;
}

const createLocalId = () => crypto.randomUUID();

export const ProcessEditorPage = () => {
    const { t } = useTranslation();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const isNew = id === 'new';

    const { data: processData } = useProcess(isNew ? null : (id ?? null));
    const createMutation = useCreateProcessMutation();
    const updateMutation = useUpdateProcessMutation();
    const applyMutation = useApplyProcessMutation();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [stereo, setStereo] = useState<'linear' | 'flexible'>('linear');
    const [stages, setStages] = useState<LocalStage[]>([]);
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [loadedId, setLoadedId] = useState<string | null>(null);
    const [showApplyForm, setShowApplyForm] = useState(false);
    const [applyItemName, setApplyItemName] = useState('');

    // Load existing process data (resets when id changes)
    useEffect(() => {
        if (!isNew && processData?.data && loadedId !== processData.data.id) {
            const p = processData.data;
            // Build clientId map for converting server dep IDs → local clientIds
            const serverToClient = new Map<string, string>();
            const localStages: LocalStage[] = p.stages.map(s => {
                const cid = createLocalId();
                serverToClient.set(s.id, cid);
                return {
                    clientId: cid,
                    name: s.name,
                    stereo: s.stereo,
                    guideText: s.guideText,
                    actionLabel: s.actionLabel,
                    actorId: s.actorId,
                    toolId: s.toolId,
                    isRequired: s.isRequired,
                    dependencyStageIds: s.dependencyStageIds,
                    order: s.order,
                };
            });
            // Remap dependency IDs from server UUIDs to local clientIds
            localStages.forEach(s => {
                s.dependencyStageIds = (s.dependencyStageIds ?? [])
                    .map(depId => serverToClient.get(depId) ?? depId)
                    .filter(Boolean);
            });
            setName(p.name);
            setDescription(p.description);
            setStereo(p.stereo);
            setStages(localStages);
            setSelectedIndex(null);
            setLoadedId(processData.data.id);
        }
    }, [isNew, processData, loadedId]);

    const handleAddStage = (stageStereo: CreateStageInput['stereo']) => {
        const newClientId = createLocalId();
        const lastStage = stages[stages.length - 1];
        const newStage: LocalStage = {
            clientId: newClientId,
            name: '',
            stereo: stageStereo,
            isRequired: true,
            order: stages.length + 1,
            dependencyStageIds: stereo === 'linear' && lastStage ? [lastStage.clientId] : [],
        };
        setStages(prev => [...prev, newStage]);
        setSelectedIndex(stages.length);
    };

    const handleRemoveStage = (index: number) => {
        const removedId = stages[index].clientId;
        setStages(prev =>
            prev
                .filter((_, i) => i !== index)
                .map((s, i) => ({
                    ...s,
                    order: i + 1,
                    dependencyStageIds: (s.dependencyStageIds ?? []).filter(d => d !== removedId),
                }))
        );
        if (selectedIndex === index) setSelectedIndex(null);
        else if (selectedIndex !== null && selectedIndex > index) setSelectedIndex(selectedIndex - 1);
    };

    const handleReorder = (index: number, direction: 'up' | 'down') => {
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= stages.length) return;
        setStages(prev => {
            const next = [...prev];
            [next[index], next[newIndex]] = [next[newIndex], next[index]];
            return next.map((s, i) => ({ ...s, order: i + 1 }));
        });
        if (selectedIndex === index) setSelectedIndex(newIndex);
        else if (selectedIndex === newIndex) setSelectedIndex(index);
    };

    const handleStageChange = (index: number, updated: LocalStage) => {
        setStages(prev => prev.map((s, i) => (i === index ? updated : s)));
    };

    const toCreateStageInputs = (): CreateStageInput[] => stages.map(({ clientId: _clientId, ...rest }) => rest);

    const handleSave = () => {
        if (!name.trim()) {
            toast.error(t('navigator.nameRequired', 'Name is required'));
            return;
        }
        const stageInputs = toCreateStageInputs();
        if (isNew) {
            createMutation.mutate(
                { name: name.trim(), description, stereo, stages: stageInputs },
                {
                    onSuccess: result => {
                        toast.success(t('navigator.processSaved', 'Process saved'));
                        navigate(`/processes/${result.data.id}`, { replace: true });
                    },
                }
            );
        } else if (id) {
            updateMutation.mutate(
                { id, input: { name: name.trim(), description, stages: stageInputs as any } },
                { onSuccess: () => toast.success(t('navigator.processSaved', 'Process saved')) }
            );
        }
    };

    const handleApplyClick = () => {
        if (isNew || !id) {
            toast.error(t('navigator.saveFirst', 'Save the process first'));
            return;
        }
        setApplyItemName('');
        setShowApplyForm(true);
    };

    const handleApplySubmit = () => {
        if (!id || !applyItemName.trim()) return;
        applyMutation.mutate(
            { processId: id, input: { name: applyItemName.trim(), thumbnailUrl: '', processId: id } },
            {
                onSuccess: result => {
                    setShowApplyForm(false);
                    navigate(`/items/${result.data.id}`);
                    toast.success(t('navigator.itemCreated', 'Item created from process'));
                },
            }
        );
    };

    const isPending = createMutation.isPending || updateMutation.isPending;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/processes')}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <h1 className="text-2xl font-bold">
                        {isNew ? t('navigator.newProcess', 'New Process') : t('navigator.editProcess', 'Edit Process')}
                    </h1>
                </div>
                <div className="flex items-center gap-2">
                    {!isNew && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleApplyClick}
                            disabled={applyMutation.isPending}
                            className="gap-1.5"
                        >
                            {applyMutation.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Play className="h-3.5 w-3.5" />
                            )}
                            {t('navigator.apply', 'Apply')}
                        </Button>
                    )}
                    <Button size="sm" onClick={handleSave} disabled={!name.trim() || isPending} className="gap-1.5">
                        {isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Save className="h-3.5 w-3.5" />
                        )}
                        {t('navigator.save', 'Save')}
                    </Button>
                </div>
            </div>

            {showApplyForm && (
                <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <Input
                        value={applyItemName}
                        onChange={e => setApplyItemName(e.target.value)}
                        placeholder={t('navigator.itemNamePlaceholder', 'Enter item name...')}
                        className="flex-1"
                        autoFocus
                        onKeyDown={e => {
                            if (e.key === 'Enter') handleApplySubmit();
                            if (e.key === 'Escape') setShowApplyForm(false);
                        }}
                    />
                    <Button
                        size="sm"
                        onClick={handleApplySubmit}
                        disabled={!applyItemName.trim() || applyMutation.isPending}
                        className="gap-1.5"
                    >
                        {applyMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Play className="h-3.5 w-3.5" />
                        )}
                        {t('navigator.createItem', 'Create Item')}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowApplyForm(false)}>
                        <X className="h-3.5 w-3.5" />
                    </Button>
                </div>
            )}

            <ProcessMetaForm
                name={name}
                description={description}
                stereo={stereo}
                onNameChange={setName}
                onDescriptionChange={setDescription}
                onStereoChange={setStereo}
                isNew={isNew}
            />

            <Separator />

            <StageTemplateList
                stages={stages}
                selectedIndex={selectedIndex}
                onAdd={handleAddStage}
                onRemove={handleRemoveStage}
                onReorder={handleReorder}
                onSelect={setSelectedIndex}
            />

            <StageTemplateEditPanel
                stage={selectedIndex !== null ? stages[selectedIndex] : null}
                stageIndex={selectedIndex}
                allStages={stages}
                onChange={handleStageChange}
                onClose={() => setSelectedIndex(null)}
            />
        </div>
    );
};
