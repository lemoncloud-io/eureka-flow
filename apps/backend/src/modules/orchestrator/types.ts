/**
 * Orchestrator interface — mock now, real Claude adapter later.
 */

export interface ProposalResult {
    proposedNodes: Record<string, unknown>[];
    proposedEdges: Record<string, unknown>[];
    estimatedCost: {
        currency: string;
        total: number;
        breakdown?: Array<{ blockType: string; amount: number }>;
    };
    approvalRequired: boolean;
    assistantMessage: string;
}

export interface Orchestrator {
    generateProposal(flowId: string, userMessage: string): Promise<ProposalResult>;
}
