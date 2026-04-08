import { PortGetParamsSchema, PortGetQuerySchema } from '@flows/contracts';

import { flowRepo } from '../../../repositories/flow-repository';
import { getPathParam, getQueryParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * GET /nodes/{portId}/port?direction=in|out
 * Caller: libs/flows/src/api/nodes.ts → getPortData()
 *
 * portId: the parent node ID (e.g. "1000882")
 * direction: "in" | "out"
 *
 * Port nodes are stored in flow.nodes[] with:
 *   { stereo: 'port', parentId, direction, name, data$ }
 *
 * Response: PortGetResponse {
 *   id: `${parentId}:${direction}@${name}`,
 *   nodeId: parentId,
 *   portId: parentId,
 *   direction,
 *   data: { value, type, timestamp? }
 * }
 *
 * If no port node is found, returns a default empty response.
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const rawPortId = getPathParam(event, 'id');
    const rawDirection = getQueryParam(event, 'direction');

    const paramsParsed = PortGetParamsSchema.safeParse({ portId: rawPortId });
    if (!paramsParsed.success) return badRequest('Missing portId');

    const queryParsed = PortGetQuerySchema.safeParse({ direction: rawDirection });
    if (!queryParsed.success) return badRequest('direction must be "in" or "out"');

    const { portId } = paramsParsed.data;
    const { direction } = queryParsed.data;

    const flows = await flowRepo.scan();

    // Find a parent node first (to get fallback data)
    let parentNode: Record<string, unknown> | undefined;
    // Find matching port node
    let portNode: Record<string, unknown> | undefined;

    for (const flow of flows) {
        const nodes = (flow.nodes as Array<Record<string, unknown>>) || [];
        for (const node of nodes) {
            // Check if this is the parent node
            if (node.id === portId && node.stereo !== 'port') {
                parentNode = node;
            }
            // Check if this is a matching port node
            if (node.stereo === 'port' && node.parentId === portId && node.direction === direction) {
                portNode = node;
            }
        }
        if (portNode) break;
        if (!portNode && parentNode) {
            // Keep scanning for port node in other flows
        }
    }

    if (portNode) {
        const name = (portNode.name as string) || direction;
        const data$ = (portNode.data$ as Record<string, unknown>) || {};
        const response = {
            id: `${portId}:${direction}@${name}`,
            nodeId: portId,
            portId,
            direction,
            data: {
                value: data$.value ?? null,
                type: (data$.type as string) || 'any',
                timestamp: data$.timestamp as number | undefined,
            },
        };
        return ok(response);
    }

    // No port node found — build default response from parent node if available
    let fallbackValue: unknown = null;
    if (parentNode) {
        if (direction === 'out') {
            const outputData = parentNode.outputData$$ as Record<string, unknown> | undefined;
            fallbackValue = outputData ?? null;
        } else {
            const inputData = parentNode.inputData$$ as Record<string, unknown> | undefined;
            fallbackValue = inputData ?? null;
        }
    }

    const defaultResponse = {
        id: `${portId}:${direction}@default`,
        nodeId: portId,
        portId,
        direction,
        data: {
            value: fallbackValue,
            type: 'any',
        },
    };

    return ok(defaultResponse);
};

export const main = withMiddleware(handler);
