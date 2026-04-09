import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { FlowEditorPage, PublicFlowsPage } from './features/flows';
import { LandingPage, PolicyPage } from './features/landing';
import { TutorialPage } from './features/tutorial';

export const App = () => {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/tutorial" element={<TutorialPage />} />
                <Route path="/explore" element={<PublicFlowsPage />} />
                <Route path="/editor" element={<FlowEditorPage />} />
                <Route path="/flows/:id" element={<FlowEditorPage />} />
                <Route path="/policy/:type" element={<PolicyPage />} />
            </Routes>
        </BrowserRouter>
    );
};
