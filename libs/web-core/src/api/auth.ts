import { OAUTH_ENDPOINT, OPENAPI_ENDPOINT, getWebCore } from '../core';
import { validateTokenResponse, withRetry } from '../utils/utils';

import type { UserProfile } from '../stores/useWebCoreStore';
import type { LemonOAuthToken, RefreshTokenBody } from '@lemoncloud/lemon-web-core';

const MAX_RETRIES = 4;

/** Exchange OAuth authorization code for credentials. */
export const createCredentialsByProvider = async (provider: string, code: string) => {
    const webCore = getWebCore();
    const { data } = await webCore
        .buildSignedRequest({
            method: 'POST',
            baseURL: `${OAUTH_ENDPOINT}/oauth/${provider}/token`,
        })
        .setBody({ code })
        .execute<{ Token: LemonOAuthToken }>();

    return await webCore.buildCredentialsByToken(data.Token);
};

/** Refresh the current auth token with exponential backoff. */
export const refreshAuthToken = async () => {
    const webCore = getWebCore();

    return withRetry(
        async () => {
            const { current, signature, authId, originToken } = await webCore.getTokenSignature();
            if (!authId || !originToken || !signature || !originToken.identityToken) {
                throw new Error('Missing required token information');
            }

            const body: RefreshTokenBody = { current, signature };
            const response = await webCore
                .buildSignedRequest({
                    method: 'POST',
                    baseURL: `${OAUTH_ENDPOINT}/oauth/${authId}/refresh`,
                })
                .setParams({ token: 1 })
                .setBody({ ...body })
                .execute<LemonOAuthToken>();

            const tokenData = {
                identityPoolId: originToken.identityPoolId,
                ...(response.data.Token ? response.data.Token : response.data),
            };
            const validatedToken = validateTokenResponse(tokenData) as unknown as LemonOAuthToken;
            await webCore.buildCredentialsByToken(validatedToken);
        },
        MAX_RETRIES,
        'Token refresh'
    );
};

/** Fetch user profile from OAuth endpoint. */
export const fetchProfile = async (): Promise<UserProfile> => {
    const webCore = getWebCore();

    return await withRetry(
        async () => {
            const { data } = await webCore
                .buildSignedRequest({
                    method: 'GET',
                    baseURL: `${OAUTH_ENDPOINT}/users/0/profile`,
                })
                .execute<UserProfile>();
            return data;
        },
        MAX_RETRIES,
        'Profile fetch'
    );
};

interface KeyView {
    id: string;
    apiKey?: string;
    name?: string;
    hidden?: boolean;
    invalid?: boolean;
}

/**
 * Fetch existing API key or create a new one via signed request.
 * After OAuth login, we need an API key for the existing x-api-key flow.
 */
export const fetchOrCreateApiKey = async (keyName?: string): Promise<string> => {
    if (!OPENAPI_ENDPOINT) {
        throw new Error('VITE_OPENAPI_ENDPOINT not configured');
    }

    const webCore = getWebCore();

    // If no explicit name, try to reuse existing key first
    if (!keyName) {
        try {
            const { data } = await webCore
                .buildSignedRequest({
                    method: 'GET',
                    baseURL: `${OPENAPI_ENDPOINT}/_keys/0/list`,
                })
                .setParams({ view: 'user' })
                .execute<{ list: KeyView[] }>();

            const validKey = data.list?.find(k => !k.invalid && !k.hidden && k.apiKey);
            if (validKey?.apiKey) return validKey.apiKey;
        } catch {
            // List failed — fall through to create
        }
    }

    // Create a new key
    const { data: created } = await webCore
        .buildSignedRequest({
            method: 'POST',
            baseURL: `${OPENAPI_ENDPOINT}/_keys/0`,
        })
        .setParams({ mocks: false })
        .setBody({ name: keyName || `eureka-flow-${Date.now()}` })
        .execute<KeyView>();

    if (!created.apiKey) {
        throw new Error('Failed to create API key: no apiKey in response');
    }

    return created.apiKey;
};
