import type { APIGatewayProxyResult } from 'aws-lambda';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,x-api-key',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

const json = (statusCode: number, body: unknown): APIGatewayProxyResult => ({
    statusCode,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});

export const ok = (body: unknown): APIGatewayProxyResult => json(200, body);
export const created = (body: unknown): APIGatewayProxyResult => json(201, body);
export const accepted = (body: unknown): APIGatewayProxyResult => json(202, body);
export const noContent = (): APIGatewayProxyResult => ({ statusCode: 204, headers: CORS_HEADERS, body: '' });

export const badRequest = (message: string): APIGatewayProxyResult =>
    json(400, { status: 400, error: 'BAD_REQUEST', message });

export const notFound = (message: string): APIGatewayProxyResult =>
    json(404, { status: 404, error: 'NOT_FOUND', message });

export const conflict = (message: string): APIGatewayProxyResult =>
    json(409, { status: 409, error: 'CONFLICT', message });

export const unprocessable = (message: string): APIGatewayProxyResult =>
    json(422, { status: 422, error: 'UNPROCESSABLE_ENTITY', message });

export const serverError = (message: string): APIGatewayProxyResult =>
    json(500, { status: 500, error: 'INTERNAL_SERVER_ERROR', message });

/** Plain text response (for GET / system info) */
export const plainText = (text: string): APIGatewayProxyResult => ({
    statusCode: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' },
    body: text,
});
