import { Suspense, lazy } from 'react';
import { Helmet } from 'react-helmet-async';

import { SITE_URL } from '@flows/shared';

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

    return (
        <>
            <Helmet>
                <title>Tutorial</title>
                <meta
                    name="description"
                    content="Learn how to build AI workflows with Eureka Flow. Step-by-step interactive tutorial."
                />
                <link rel="canonical" href={`${SITE_URL}/tutorial`} />
                <meta property="og:title" content="Tutorial — Eureka Flow" />
                <meta
                    property="og:description"
                    content="Learn how to build AI workflows with Eureka Flow. Step-by-step interactive tutorial."
                />
                <meta property="og:url" content={`${SITE_URL}/tutorial`} />
                <meta property="og:image" content={`${SITE_URL}/images/screenshot-light.jpg`} />
            </Helmet>
            <Suspense fallback={<LoadingFallback />}>{isMobile ? <MobileTutorialPage /> : <TutorialPage />}</Suspense>
        </>
    );
};
