import { useNavigate } from 'react-router-dom';

import { isOAuthEnabled, redirectToLogin } from '@flows/web-core';

import { ROUTES } from '../consts';
import { shouldShowTutorial } from '../utils';

export const useStartNavigation = () => {
    const navigate = useNavigate();

    return () => {
        if (shouldShowTutorial()) {
            if (isOAuthEnabled) {
                redirectToLogin();
            } else {
                navigate(ROUTES.TUTORIAL);
            }
        } else {
            navigate(ROUTES.DASHBOARD);
        }
    };
};
