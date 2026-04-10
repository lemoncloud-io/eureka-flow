import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import { FlowGraphView } from '../../flows/components/FlowGraphView';

interface MobileFlowMapProps {
    open: boolean;
    onClose: () => void;
    onTapNode: (nodeId: string) => void;
    flowId: string | null;
}

export const MobileFlowMap = ({ open, onClose, onTapNode, flowId }: MobileFlowMapProps) => {
    const { t } = useTranslation(['flows']);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-40 bg-background flex flex-col animate-in fade-in duration-200">
            <div className="flex items-center justify-between px-4 h-12 border-b border-border/60 shrink-0 pt-[env(safe-area-inset-top)]">
                <span className="text-sm font-semibold">{t('header.graphView', 'Graph View')}</span>
                <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-accent/50 transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="flex-1 relative overflow-hidden">
                <FlowGraphView flowId={flowId} className="w-full h-full" onNodeClick={onTapNode} />
            </div>
        </div>
    );
};
