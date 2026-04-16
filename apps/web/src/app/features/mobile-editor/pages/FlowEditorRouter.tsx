import { Suspense, lazy } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';

import { useFlowDescription, useFlowName, useFlowThumbnail } from '@flows/flows';
import { SITE_URL } from '@flows/shared';

import { useIsMobile } from '../hooks';

const FlowEditorPage = lazy(() =>
    import('../../flows/pages/FlowEditorPage').then(m => ({ default: m.FlowEditorPage }))
);
const MobileFlowEditorPage = lazy(() =>
    import('./MobileFlowEditorPage').then(m => ({ default: m.MobileFlowEditorPage }))
);

const LoadingFallback = () => (
    <div className="flex h-screen bg-background items-center justify-center">
        <div className="w-8 h-8 border-2 border-border/40 border-t-primary rounded-full animate-spin" />
    </div>
);

const DEFAULT_FLOW_NAME = 'Untitled Workflow';
const FALLBACK_IMAGE = `${SITE_URL}/images/screenshot-light.jpg`;

const FlowSeoHelmet = () => {
    const { pathname } = useLocation();
    const flowName = useFlowName();
    const flowDescription = useFlowDescription();
    const flowThumbnail = useFlowThumbnail();

    if (flowName === DEFAULT_FLOW_NAME) return null;

    const isPublicFlow = pathname.startsWith('/flows/');
    const canonicalUrl = `${SITE_URL}${pathname}`;
    const description = flowDescription || `${flowName} — a workflow built on Eureka Flow`;
    const ogImage = flowThumbnail || FALLBACK_IMAGE;

    const robotsContent = isPublicFlow ? 'index, follow' : 'noindex, nofollow';

    return (
        <Helmet>
            <title>{flowName}</title>
            <meta name="description" content={description} />
            <meta name="robots" content={robotsContent} />
            {isPublicFlow && <link rel="canonical" href={canonicalUrl} />}
            <meta property="og:title" content={flowName} />
            <meta property="og:description" content={description} />
            <meta property="og:url" content={canonicalUrl} />
            <meta property="og:image" content={ogImage} />
            <meta name="twitter:title" content={flowName} />
            <meta name="twitter:description" content={description} />
            <meta name="twitter:image" content={ogImage} />
        </Helmet>
    );
};

export const FlowEditorRouter = () => {
    const isMobile = useIsMobile();

    return (
        <>
            <FlowSeoHelmet />
            <Suspense fallback={<LoadingFallback />}>
                {isMobile ? <MobileFlowEditorPage /> : <FlowEditorPage />}
            </Suspense>
        </>
    );
};
