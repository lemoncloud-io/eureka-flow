import type { RouteObject } from 'react-router-dom';

import { FlowEditorPage } from './pages';

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
