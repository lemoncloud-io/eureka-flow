import { Suspense, lazy } from 'react';

import { useIsMobile } from '../../mobile-editor/hooks';

const TutorialPage = lazy(() => import('./TutorialPage').then(m => ({ default: m.TutorialPage })));
const MobileTutorialPage = lazy(() => import('./MobileTutorialPage').then(m => ({ default: m.MobileTutorialPage })));

const LoadingFallback = () => (
    <div className="flex h-screen bg-background items-center justify-center">
        <div className="w-8 h-8 border-2 border-border/40 border-t-primary rounded-full animate-spin" />
    </div>
);

export const TutorialRouter = () => {
    const isMobile = useIsMobile();

    return <Suspense fallback={<LoadingFallback />}>{isMobile ? <MobileTutorialPage /> : <TutorialPage />}</Suspense>;
};
