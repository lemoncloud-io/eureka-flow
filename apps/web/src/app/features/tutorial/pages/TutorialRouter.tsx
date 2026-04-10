import { Suspense, lazy } from 'react';

import { useIsMobile } from '../../mobile-editor/hooks';

const TutorialPage = lazy(() => import('./TutorialPage').then(m => ({ default: m.TutorialPage })));
const MobileTutorialPage = lazy(() => import('./MobileTutorialPage').then(m => ({ default: m.MobileTutorialPage })));

const LoadingFallback = () => (
    <div className="flex h-screen bg-background items-center justify-center">
        <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-4 border-border rounded-full" />
            <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin" />
        </div>
    </div>
);

export const TutorialRouter = () => {
    const isMobile = useIsMobile();

    return <Suspense fallback={<LoadingFallback />}>{isMobile ? <MobileTutorialPage /> : <TutorialPage />}</Suspense>;
};
