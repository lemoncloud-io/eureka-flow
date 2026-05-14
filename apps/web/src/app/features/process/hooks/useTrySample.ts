import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { toast } from 'sonner';

import { useApplyProcessMutation, useProcesses } from '@flows/flows';

export const useTrySample = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { data: processesData } = useProcesses();
    const applyMutation = useApplyProcessMutation();

    const handleTrySample = () => {
        const sampleProcess = processesData?.data?.[0];
        if (!sampleProcess) {
            toast.error(t('navigator.noProcesses', 'No process templates available'));
            return;
        }
        applyMutation.mutate(
            {
                processId: sampleProcess.id,
                input: { name: 'Sample Item', thumbnailUrl: '', processId: sampleProcess.id },
            },
            {
                onSuccess: result => {
                    navigate(`/items/${result.data.id}`);
                    toast.success(t('navigator.sampleCreated', 'Sample item created!'));
                },
            }
        );
    };

    return { handleTrySample, isPending: applyMutation.isPending };
};
