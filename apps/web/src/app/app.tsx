import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';

import { NotFoundPage, SITE_URL } from '@flows/shared';
import { isOAuthEnabled } from '@flows/web-core';

import { AppsPage } from './features/apps';
import { KeyCreationPage, KeySuccessPage, LoginPage, OAuthResponsePage } from './features/auth';
import { PublicFlowsPage } from './features/flows';
import { HomePage } from './features/home';
import { PolicyPage } from './features/landing';
import { FlowEditorRouter } from './features/mobile-editor';
import {
    ActorManagerPage,
    DashboardPage,
    ItemBoardPage,
    ItemDetailPage,
    NavigatorLayout,
    ProcessEditorPage,
    ProcessListPage,
    ToolManagerPage,
} from './features/process';
import { TutorialRouter } from './features/tutorial';

const LegacyStageRedirect = () => {
    const { id, stageId } = useParams<{ id: string; stageId: string }>();
    return <Navigate to={`/items/${id}?stage=${stageId}`} replace />;
};

const LegacyApplyRedirect = () => {
    const { id } = useParams<{ id: string }>();
    return <Navigate to={`/processes/${id}`} replace />;
};

export const App = () => {
    const { i18n } = useTranslation();

    return (
        <BrowserRouter>
            <Helmet defaultTitle="Eureka Flow" titleTemplate="%s — Eureka Flow">
                <html lang={i18n.language === 'ko' ? 'ko' : 'en'} />
                <meta name="description" content="Build, run, and share AI workflows visually. No code required." />
                <meta property="og:site_name" content="Eureka Flow" />
                <meta name="twitter:card" content="summary_large_image" />
                <link rel="alternate" hrefLang="en" href={`${SITE_URL}/`} />
                <link rel="alternate" hrefLang="ko" href={`${SITE_URL}/`} />
                <link rel="alternate" hrefLang="x-default" href={`${SITE_URL}/`} />
            </Helmet>
            <Routes>
                <Route path="/" element={<HomePage />} />

                {/* Navigator routes */}
                <Route element={<NavigatorLayout />}>
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/items" element={<ItemBoardPage />} />
                    <Route path="/items/:id" element={<ItemDetailPage />} />
                    <Route path="/processes" element={<ProcessListPage />} />
                    <Route path="/processes/:id" element={<ProcessEditorPage />} />
                    <Route path="/actors" element={<ActorManagerPage />} />
                    <Route path="/tools" element={<ToolManagerPage />} />
                </Route>
                {/* Legacy redirects */}
                <Route path="/items/:id/stages/:stageId" element={<LegacyStageRedirect />} />
                <Route path="/processes/:id/apply" element={<LegacyApplyRedirect />} />

                {/* Builder routes */}
                <Route path="/flows" element={<PublicFlowsPage />} />
                <Route path="/editor" element={<FlowEditorRouter />} />
                <Route path="/flows/:id" element={<FlowEditorRouter />} />

                {/* Apps: the public gallery list only. `/apps/:id` is served by CloudFront (the
                    deployed App's own bundle), never by this SPA — see
                    docs/adr/0003-apps-route-ownership.md. */}
                <Route path="/apps" element={<AppsPage />} />

                {/* Other routes */}
                <Route path="/tutorial" element={<TutorialRouter />} />
                <Route path="/policy/:type" element={<PolicyPage />} />
                {isOAuthEnabled && (
                    <>
                        <Route path="/auth/login" element={<LoginPage />} />
                        <Route path="/auth/oauth-response" element={<OAuthResponsePage />} />
                        <Route path="/auth/create-key" element={<KeyCreationPage />} />
                        <Route path="/auth/key-created" element={<KeySuccessPage />} />
                    </>
                )}

                {/* Catch-all: unmatched paths. `/apps/:id` lands here in local dev only —
                    in production CloudFront serves it before the SPA is reached. */}
                <Route path="*" element={<NotFoundPage />} />
            </Routes>
        </BrowserRouter>
    );
};
