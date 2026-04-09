import { Suspense, lazy } from 'react';

import { useIsMobile } from '../hooks';

const FlowEditorPage = lazy(() =>
    import('../../flows/pages/FlowEditorPage').then(m => ({ default: m.FlowEditorPage }))
);
const MobileFlowEditorPage = lazy(() =>
    import('./MobileFlowEditorPage').then(m => ({ default: m.MobileFlowEditorPage }))
);

const LoadingFallback = () => (
    <div className="flex h-screen bg-background items-center justify-center">
        <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-4 border-border rounded-full" />
            <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin" />
        </div>
    </div>
);

export const FlowEditorRouter = () => {
    const isMobile = useIsMobile();

    return (
        <Suspense fallback={<LoadingFallback />}>{isMobile ? <MobileFlowEditorPage /> : <FlowEditorPage />}</Suspense>
    );
};
