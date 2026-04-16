import { X } from 'lucide-react';

import { FlowGraphView } from '../../flows/components/FlowGraphView';

interface MobileFlowMapProps {
    open: boolean;
    onClose: () => void;
    onTapNode: (nodeId: string) => void;
    flowId: string | null;
}

export const MobileFlowMap = ({ open, onClose, onTapNode, flowId }: MobileFlowMapProps) => {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-40 animate-in fade-in duration-200">
            <FlowGraphView flowId={flowId} className="w-full h-full" onNavigateToNode={onTapNode} />

            {/* Floating Close Button */}
            <div className="absolute top-3 right-3 z-10 pt-[env(safe-area-inset-top)]">
                <button
                    onClick={onClose}
                    className="flex items-center justify-center w-9 h-9 rounded-xl bg-background/80 backdrop-blur-xl border border-border/50 shadow-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};
