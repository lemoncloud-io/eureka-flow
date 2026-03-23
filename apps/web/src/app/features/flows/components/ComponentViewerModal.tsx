import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import { loadFlow } from '@flows/flows';

import type { WorkflowState } from '@lemoncloud/eureka-flows-api';

// Note: WorkflowCanvas is imported as a lazy dependency to avoid circular imports
interface ComponentViewerModalProps {
    flowId: string;
    onClose: () => void;
    WorkflowCanvasComponent: React.ComponentType<{ initialData?: WorkflowState; readOnly?: boolean }>;
}

export const ComponentViewerModal: React.FC<ComponentViewerModalProps> = ({
    flowId,
    onClose,
    WorkflowCanvasComponent,
}) => {
    const { t } = useTranslation(['flows']);
    const [flowData, setFlowData] = useState<WorkflowState | null>(null);

    useEffect(() => {
        if (flowId) {
            loadFlow(flowId)
                .then(setFlowData)
                .catch(() => setFlowData(null));
        } else {
            setFlowData(null);
        }
    }, [flowId]);

    if (!flowData) return null;

    return (
        <div
            className="absolute inset-0 z-50 bg-background/80 flex items-center justify-center p-10 backdrop-blur-sm"
            onMouseDown={e => e.stopPropagation()}
            onWheel={e => e.stopPropagation()}
        >
            <div className="bg-surface border border-border w-full h-full rounded shadow-2xl flex flex-col overflow-hidden">
                <div className="p-3 border-b border-border flex justify-between items-center bg-muted">
                    <h3 className="text-sm font-bold text-foreground">{t('canvas.componentDesignView')}</h3>
                    <button
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                        <X className="w-4 h-4" /> {t('canvas.close')}
                    </button>
                </div>
                <div className="flex-1 relative">
                    <WorkflowCanvasComponent initialData={flowData} readOnly={true} />
                </div>
            </div>
        </div>
    );
};
