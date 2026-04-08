import { type FlowRecord, flowRepo } from '../repositories/flow-repository';
import { messageRepo } from '../repositories/message-repository';
import { proposalRepo } from '../repositories/proposal-repository';
import { generateNumericId } from '../utils/id-generator';

import type { Message, Proposal } from '@flows/contracts';

/**
 * Proposal state transition rules:
 * - PENDING → APPROVED (only transition that modifies flow)
 * - PENDING → REJECTED (proposal status only, flow untouched)
 * - APPROVED/REJECTED → anything: REJECTED (409 Conflict)
 * - EXPIRED → anything: REJECTED (409 Conflict)
 */

export interface ApproveResult {
    proposal: Proposal;
    flow: FlowRecord;
}

export interface RejectResult {
    proposal: Proposal;
}

export const proposalService = {
    /**
     * Approve a proposal:
     * 1. Validate PENDING status (conditional)
     * 2. Replace flow nodes/edges with proposal snapshot
     * 3. Update proposal status → APPROVED
     * 4. Save SYSTEM message for audit trail
     */
    async approve(
        proposalId: string,
        decisionNote?: string
    ): Promise<{ ok: true; data: ApproveResult } | { ok: false; error: string; status: number }> {
        const proposal = await proposalRepo.get(proposalId);
        if (!proposal) return { ok: false, error: `Proposal ${proposalId} not found`, status: 404 };

        // Conditional: only PENDING can be approved
        if (proposal.status !== 'PENDING') {
            return { ok: false, error: `Proposal is already ${proposal.status}`, status: 409 };
        }

        const flow = await flowRepo.get(proposal.flowId);
        if (!flow) return { ok: false, error: `Flow ${proposal.flowId} not found`, status: 404 };

        const now = new Date().toISOString();

        // Replace flow snapshot with proposal's nodes/edges
        const updatedFlow: FlowRecord = {
            ...flow,
            nodes: proposal.proposedNodes,
            edges: proposal.proposedEdges,
            state: 'active', // DRAFT → active on approval
            updatedAt: now,
        };
        await flowRepo.put(updatedFlow);

        // Update proposal status
        const updatedProposal: Proposal = {
            ...proposal,
            status: 'APPROVED',
            decisionReason: decisionNote ?? null,
            updatedAt: now,
        };
        await proposalRepo.put(updatedProposal);

        // Save SYSTEM message for audit
        const sysMsg: Message = {
            messageId: generateNumericId(),
            flowId: proposal.flowId,
            role: 'SYSTEM',
            messageType: 'STATUS',
            content: `제안이 승인되었습니다. ${proposal.proposedNodes.length}개 블록이 캔버스에 배치됩니다.`,
            proposalId,
            createdAt: now,
        };
        await messageRepo.put(sysMsg);

        return { ok: true, data: { proposal: updatedProposal, flow: updatedFlow } };
    },

    /**
     * Reject a proposal:
     * 1. Validate PENDING status (conditional)
     * 2. Update proposal status → REJECTED (flow unchanged)
     * 3. Save SYSTEM message for audit trail
     */
    async reject(
        proposalId: string,
        reason?: string
    ): Promise<{ ok: true; data: RejectResult } | { ok: false; error: string; status: number }> {
        const proposal = await proposalRepo.get(proposalId);
        if (!proposal) return { ok: false, error: `Proposal ${proposalId} not found`, status: 404 };

        if (proposal.status !== 'PENDING') {
            return { ok: false, error: `Proposal is already ${proposal.status}`, status: 409 };
        }

        const now = new Date().toISOString();

        const updatedProposal: Proposal = {
            ...proposal,
            status: 'REJECTED',
            decisionReason: reason ?? null,
            updatedAt: now,
        };
        await proposalRepo.put(updatedProposal);

        // Save SYSTEM message for audit
        const sysMsg: Message = {
            messageId: generateNumericId(),
            flowId: proposal.flowId,
            role: 'SYSTEM',
            messageType: 'STATUS',
            content: reason ? `제안이 거절되었습니다. 사유: ${reason}` : '제안이 거절되었습니다.',
            proposalId,
            createdAt: now,
        };
        await messageRepo.put(sysMsg);

        return { ok: true, data: { proposal: updatedProposal } };
    },
};
