import { Suspense, lazy } from 'react';

import { LoadingFallback } from '@flows/shared';

const LandingPage = lazy(() => import('../landing').then(m => ({ default: m.LandingPage })));

export const HomePage = () => (
    <Suspense fallback={<LoadingFallback />}>
        <LandingPage />
    </Suspense>
);
