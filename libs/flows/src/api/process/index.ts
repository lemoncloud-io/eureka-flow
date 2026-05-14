import { mockApi } from './mockApi';
import { realApi } from './realApi';

import type { ProcessApi } from './interface';

const useMock = !import.meta.env.VITE_PROCESS_API || import.meta.env.VITE_PROCESS_API === 'mock';

export const processApi: ProcessApi = useMock ? mockApi : realApi;

export type { ProcessApi } from './interface';
export { mockApi, resetMockDb } from './mockApi';
export { realApi } from './realApi';
