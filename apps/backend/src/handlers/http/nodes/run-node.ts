import { NodeRunParamsSchema, NodeRunRequestSchema } from '@flows/contracts';

import { flowRepo } from '../../../repositories/flow-repository';
import { getBody, getPathParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, notFound, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * POST /nodes/{nodeId}/run[?async&force&propagate=0]
 * Caller: libs/flows/src/api/nodes.ts → runNode()
 *
 * Body: { config?: Record<string,string>, output?: Record<string,DataPacket> }
 * Query flags: async (flag), force (flag), propagate=0
 * Returns: NodeView (the node after fake execution)
 *
 * FAKE EXECUTION:
 * 1. Find the node across all flows
 * 2. If body.output is provided (frontend-executed node), save the output to node
 * 3. Update node state: IDLE → RUNNING → COMPLETED (immediately)
 * 4. Set executionStats: { startTime, duration: 0, progress: 100 }
 * 5. Save back to flow and return updated node
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const rawId = getPathParam(event, 'id');
    const paramsParsed = NodeRunParamsSchema.safeParse({ nodeId: rawId });
    if (!paramsParsed.success) return badRequest('Missing node ID');
    const { nodeId } = paramsParsed.data;

    const body = getBody<Record<string, unknown>>(event);
    const bodyParsed = NodeRunRequestSchema.safeParse(body ?? {});
    if (!bodyParsed.success) return badRequest('Invalid run body');

    const { config, output } = bodyParsed.data;

    const flows = await flowRepo.scan();
    for (const flow of flows) {
        const nodes = (flow.nodes as Array<Record<string, unknown>>) || [];
        const idx = nodes.findIndex(n => n.id === nodeId);
        if (idx !== -1) {
            const now = new Date().toISOString();
            const startTime = Date.now();

            const existingNode = nodes[idx];

            // Build updated node with fake execution result
            const updatedNode: Record<string, unknown> = {
                ...existingNode,
                updatedAt: now,
                state: 'COMPLETED',
                executionStats: {
                    startTime,
                    duration: 0,
                    progress: 100,
                },
            };

            // Apply config if provided
            if (config) {
                updatedNode.config = { ...(existingNode.config as Record<string, unknown> | undefined), ...config };
            }

            // Apply output if provided (frontend-executed node)
            if (output) {
                updatedNode.output = output;
                updatedNode.outputData$$ = output;
            }

            const updatedNodes = nodes.map((n, i) => (i === idx ? updatedNode : n));
            await flowRepo.put({ ...flow, nodes: updatedNodes, updatedAt: now });

            return ok(updatedNode);
        }
    }

    return notFound(`Node ${nodeId} not found`);
};

export const main = withMiddleware(handler);
