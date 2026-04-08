import { MessageCreateParamsSchema, MessageCreateRequestSchema } from '@flows/contracts';

import { getOrchestrator } from '../../../modules/orchestrator';
import { flowRepo } from '../../../repositories/flow-repository';
import { messageRepo } from '../../../repositories/message-repository';
import { proposalRepo } from '../../../repositories/proposal-repository';
import { generateNumericId } from '../../../utils/id-generator';
import { getBody, getPathParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, created, notFound } from '../../../utils/response';

import type { Message, Proposal } from '@flows/contracts';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * POST /flows/{flowId}/messages
 *
 * 1. Save USER message
 * 2. Call orchestrator (mock) → generate proposal
 * 3. Save proposal
 * 4. Save ASSISTANT message
 * 5. Return { message, proposal, assistantMessage }
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const flowId = getPathParam(event, 'flowId');
    const paramsParsed = MessageCreateParamsSchema.safeParse({ flowId });
    if (!paramsParsed.success) return badRequest('flowId is required');

    const body = getBody(event);
    const bodyParsed = MessageCreateRequestSchema.safeParse(body);
    if (!bodyParsed.success) return badRequest('content is required');

    // Verify flow exists
    const flow = await flowRepo.get(paramsParsed.data.flowId);
    if (!flow) return notFound(`Flow ${flowId} not found`);

    const now = new Date().toISOString();
    const fid = paramsParsed.data.flowId;

    // 1. Save USER message
    const userMessage: Message = {
        messageId: generateNumericId(),
        flowId: fid,
        role: 'USER',
        messageType: 'TEXT',
        content: bodyParsed.data.content,
        createdAt: now,
    };
    await messageRepo.put(userMessage);

    // 2. Generate proposal (mock or claude, based on ORCHESTRATOR_MODE env)
    const orchestrator = await getOrchestrator();
    const result = await orchestrator.generateProposal(fid, bodyParsed.data.content);

    // 3. Save proposal
    const proposalId = generateNumericId();
    const proposal: Proposal = {
        proposalId,
        flowId: fid,
        sourceMessageId: userMessage.messageId,
        status: 'PENDING',
        proposedNodes: result.proposedNodes,
        proposedEdges: result.proposedEdges,
        estimatedCost: result.estimatedCost,
        approvalRequired: result.approvalRequired,
        createdAt: now,
        updatedAt: now,
    };
    await proposalRepo.put(proposal);

    // 4. Save ASSISTANT message
    const assistantMessage: Message = {
        messageId: generateNumericId(),
        flowId: fid,
        role: 'ASSISTANT',
        messageType: 'PROPOSAL',
        content: result.assistantMessage,
        proposalId,
        createdAt: now,
    };
    await messageRepo.put(assistantMessage);

    // 5. Return
    return created({
        message: userMessage,
        proposal: {
            proposalId: proposal.proposalId,
            flowId: proposal.flowId,
            status: proposal.status,
            estimatedCost: proposal.estimatedCost,
            proposedNodes: proposal.proposedNodes,
            proposedEdges: proposal.proposedEdges,
            approvalRequired: proposal.approvalRequired,
            createdAt: proposal.createdAt,
        },
        assistantMessage,
    });
};

export const main = withMiddleware(handler);
