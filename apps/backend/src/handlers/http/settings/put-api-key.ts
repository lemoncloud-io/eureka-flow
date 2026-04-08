import { ApiKeyPutRequestSchema } from '@flows/contracts';

import { maskKey, settingsService } from '../../../services/settings-service';
import { getBody, withMiddleware } from '../../../utils/middleware';
import { badRequest, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * PUT /settings/api-keys
 *
 * Body: { provider, apiKey }
 * Returns: { provider, configured, maskedKey, status }
 *
 * Raw key is stored but NEVER returned in the response.
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const body = getBody<Record<string, unknown>>(event) ?? {};
    const parsed = ApiKeyPutRequestSchema.safeParse(body);
    if (!parsed.success) {
        return badRequest(`Invalid request: ${parsed.error.errors.map(e => e.message).join(', ')}`);
    }

    const { provider, apiKey } = parsed.data;
    await settingsService.putKey(provider, apiKey);

    return ok({
        provider,
        configured: true,
        maskedKey: maskKey(apiKey),
        status: 'unverified',
    });
};

export const main = withMiddleware(handler);
