import { LoggingProcessApiWrapper } from './loggingWrapper';
import { mockApi } from './mockApi';
import { realApi } from './realApi';

import type { ProcessApi } from './interface';

const useReal = import.meta.env.VITE_PROCESS_API === 'real' && !import.meta.env.VITEST;

export const processApi: ProcessApi = useReal ? realApi : new LoggingProcessApiWrapper(mockApi);

export type { ProcessApi } from './interface';
export { mockApi, resetMockDb } from './mockApi';
export { realApi } from './realApi';
export { LoggingProcessApiWrapper } from './loggingWrapper';
