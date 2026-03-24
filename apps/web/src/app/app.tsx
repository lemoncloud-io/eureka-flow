import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { FlowEditorPage, FlowExamplesPage } from './features/flows';
import { LandingPage } from './features/landing';

const App = () => {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/editor" element={<FlowEditorPage />} />
                <Route path="/flows/:id" element={<FlowEditorPage />} />
                <Route path="/flow/examples" element={<FlowExamplesPage />} />
            </Routes>
        </BrowserRouter>
    );
};

export default App;
