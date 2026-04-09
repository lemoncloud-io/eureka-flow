import { getStoredApiKey } from '@flows/web-core';

/** API key가 없으면 tutorial로, 있으면 editor로 */
export const shouldShowTutorial = (): boolean => !getStoredApiKey();
