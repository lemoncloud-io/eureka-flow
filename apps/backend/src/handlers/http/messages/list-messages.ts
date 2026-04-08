import { MessageListParamsSchema } from '@flows/contracts';

import { messageRepo } from '../../../repositories/message-repository';
import { getPathParam, getQueryParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * GET /flows/{flowId}/messages
 *
 * Query: limit (default 50), cursor (optional)
 * Returns: { items: Message[], nextCursor: string | null }
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const flowId = getPathParam(event, 'flowId');
    const parsed = MessageListParamsSchema.safeParse({ flowId });
    if (!parsed.success) return badRequest('flowId is required');

    const limit = Number(getQueryParam(event, 'limit') || '50');
    const result = await messageRepo.listByFlow(parsed.data.flowId, limit);

    return ok({
        items: result.items,
        nextCursor: result.nextCursor,
    });
};

export const main = withMiddleware(handler);
