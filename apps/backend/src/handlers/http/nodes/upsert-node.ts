import { NodeUpsertParamsSchema, NodeUpsertQuerySchema } from '@flows/contracts';

import { flowRepo } from '../../../repositories/flow-repository';
import { generateNumericId } from '../../../utils/id-generator';
import { getBody, getPathParam, getQueryParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, notFound, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * POST /nodes/{id}/upsert?flowId={flowId}
 * Caller: libs/flows/src/api/nodes.ts → upsertNode(), upsertPortNode()
 *
 * Path:  id — "0" for auto-assign, else update existing node
 * Query: flowId (required)
 * Body (two formats):
 *   1. Direct node fields: { config?, output?, blockId?, position?, ... }
 *   2. Port node batch:    { nodes: [{ stereo: 'port', parentId, direction, name, data$ }] }
 *
 * Returns: UpsertNodeResult { nodes: NodeData[], edges?: EdgeData[] }
 *
 * Nodes are stored inside the flow document (flow.nodes[]).
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    // Validate path param
    const rawId = getPathParam(event, 'id');
    const paramsParsed = NodeUpsertParamsSchema.safeParse({ id: rawId });
    if (!paramsParsed.success) return badRequest('Missing node ID in path');
    const { id } = paramsParsed.data;

    // Validate query param
    const rawFlowId = getQueryParam(event, 'flowId');
    const queryParsed = NodeUpsertQuerySchema.safeParse({ flowId: rawFlowId });
    if (!queryParsed.success) return badRequest('flowId query parameter is required');
    const { flowId } = queryParsed.data;

    const body = getBody<Record<string, unknown>>(event);
    if (!body) return badRequest('Request body is required');

    const flow = await flowRepo.get(flowId);
    if (!flow) return notFound(`Flow ${flowId} not found`);

    const now = new Date().toISOString();
    const nodes = [...((flow.nodes as Array<Record<string, unknown>>) || [])];

    // ── Format 2: Batch port node upsert ──────────────────────────────────────
    if (Array.isArray(body.nodes)) {
        const incomingNodes = body.nodes as Array<Record<string, unknown>>;
        const upsertedNodes: Record<string, unknown>[] = [];

        for (const incoming of incomingNodes) {
            const incomingId = incoming.id as string | undefined;

            if (incomingId && incomingId !== '0') {
                // Update existing port node
                const idx = nodes.findIndex(n => n.id === incomingId);
                if (idx !== -1) {
                    nodes[idx] = { ...nodes[idx], ...incoming, updatedAt: now };
                    upsertedNodes.push(nodes[idx]);
                } else {
                    // Not found — create it with the given id
                    const node: Record<string, unknown> = {
                        ...incoming,
                        id: incomingId,
                        flowId,
                        createdAt: now,
                        updatedAt: now,
                    };
                    nodes.push(node);
                    upsertedNodes.push(node);
                }
            } else {
                // Auto-assign new ID
                const node: Record<string, unknown> = {
                    ...incoming,
                    id: generateNumericId(),
                    flowId,
                    createdAt: now,
                    updatedAt: now,
                };
                nodes.push(node);
                upsertedNodes.push(node);
            }
        }

        await flowRepo.put({ ...flow, nodes, updatedAt: now });
        return ok({ nodes: upsertedNodes });
    }

    // ── Format 1: Direct node fields ─────────────────────────────────────────
    if (id === '0') {
        // Create new node
        const newNode: Record<string, unknown> = {
            ...body,
            id: generateNumericId(),
            flowId,
            createdAt: now,
            updatedAt: now,
        };
        nodes.push(newNode);
        await flowRepo.put({ ...flow, nodes, updatedAt: now });
        return ok({ nodes: [newNode] });
    }

    // Update existing node
    const idx = nodes.findIndex(n => n.id === id);
    if (idx === -1) return notFound(`Node ${id} not found in flow ${flowId}`);

    nodes[idx] = { ...nodes[idx], ...body, id, updatedAt: now };
    await flowRepo.put({ ...flow, nodes, updatedAt: now });
    return ok({ nodes: [nodes[idx]] });
};

export const main = withMiddleware(handler);
