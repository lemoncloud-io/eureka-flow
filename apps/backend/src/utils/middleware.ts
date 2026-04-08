import { log } from './logger';
import { badRequest, serverError } from './response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

type Handler = (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;

/**
 * Wraps a handler with common middleware:
 * - JSON body parsing (event.body → event.parsedBody)
 * - Error catching → 500 response
 * - Request logging
 */
export const withMiddleware = (handler: Handler): Handler => {
    return async event => {
        const method = event.httpMethod || event.requestContext?.http?.method || '?';
        const path = event.path || event.rawPath || '?';
        log.info(`${method} ${path}`);

        try {
            // Parse JSON body if present
            if (event.body) {
                try {
                    (event as APIGatewayProxyEvent & { parsedBody: unknown }).parsedBody = JSON.parse(event.body);
                } catch {
                    return badRequest('Invalid JSON body');
                }
            }

            return await handler(event);
        } catch (err) {
            log.error(`Handler error: ${method} ${path}`, err);
            const message = err instanceof Error ? err.message : 'Internal server error';
            return serverError(message);
        }
    };
};

/** Extract parsed body from event (set by withMiddleware) */
export const getBody = <T = unknown>(event: APIGatewayProxyEvent): T | undefined => {
    return (event as APIGatewayProxyEvent & { parsedBody?: T }).parsedBody;
};

/** Extract path parameter */
export const getPathParam = (event: APIGatewayProxyEvent, name: string): string | undefined => {
    return event.pathParameters?.[name] ?? undefined;
};

/** Extract query string parameter */
export const getQueryParam = (event: APIGatewayProxyEvent, name: string): string | undefined => {
    return event.queryStringParameters?.[name] ?? undefined;
};
