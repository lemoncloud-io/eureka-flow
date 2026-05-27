import { fromServer, toServer } from './adapters';
import { createProxyApi } from './proxyApi';
import { proxyCall } from './proxyClient';

import type { ProcessApi } from './interface';

/**
 * Real API implementation built using createProxyApi skeleton.
 */
export const realApi: ProcessApi = createProxyApi(async (type, cmd, id, param, body) => {
    // 1. Resolve payload
    const payload = cmd === 'hello' ? { param, body } : body ? toServer(body) : param ? toServer(param) : undefined;

    // 2. Perform proxyCall (defaulting id to '0' if undefined to match old behavior)
    const res = await proxyCall<any>(type, cmd, id ?? '0', payload);

    // 3. Adapt response data from server
    if (res && typeof res === 'object' && 'data' in res) {
        return {
            ...res,
            data: fromServer(res.data),
        };
    }

    return res;
});
