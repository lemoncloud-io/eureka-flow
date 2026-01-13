import { FlowEditorPage } from './pages';

import type { RouteObject } from 'react-router-dom';

export const flowsRoutes: RouteObject[] = [
    {
        path: '/',
        element: <FlowEditorPage />,
    },
    {
        path: '/flows/:flowId',
        element: <FlowEditorPage />,
    },
];
