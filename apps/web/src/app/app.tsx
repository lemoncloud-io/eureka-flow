import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { PublicFlowsPage } from './features/flows';
import { LandingPage, PolicyPage } from './features/landing';
import { FlowEditorRouter } from './features/mobile-editor';
import { TutorialPage } from './features/tutorial';

export const App = () => {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/tutorial" element={<TutorialPage />} />
                <Route path="/flows" element={<PublicFlowsPage />} />
                <Route path="/editor" element={<FlowEditorRouter />} />
                <Route path="/flows/:id" element={<FlowEditorRouter />} />
                <Route path="/policy/:type" element={<PolicyPage />} />
            </Routes>
        </BrowserRouter>
    );
};
