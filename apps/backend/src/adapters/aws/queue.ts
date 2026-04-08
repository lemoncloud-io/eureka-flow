import { executionEngine } from '../../services/execution-engine';

import type { QueueMessage } from '@flows/contracts';

/**
 * Queue abstraction — decouples run-service from execution engine.
 *
 * Local mode  (STAGE=local, no SQS):
 *   send() calls processLocally() inline, so the API still returns a
 *   completed run (synchronous fallback for serverless-offline).
 *
 * Prod mode  (STAGE != local):
 *   send() would publish to SQS; processLocally() is the Lambda handler body.
 *   SQS trigger wiring is commented out in serverless.yml (future Phase 4+).
 */

const STAGE = process.env.STAGE || 'local';
const IS_LOCAL = STAGE === 'local';

export const queue = {
    /**
     * Send a queue message.
     * In local mode: immediately processed inline.
     * In prod mode: would send to SQS (stubbed — extend when deploying to AWS).
     */
    async send(message: QueueMessage): Promise<void> {
        if (IS_LOCAL) {
            // Synchronous fallback so local dev E2E tests still see a completed run
            await this.processLocally(message);
        } else {
            // TODO (Phase 4+): publish message to SQS
            // const sqsClient = new SQSClient({ region: process.env.AWS_REGION });
            // await sqsClient.send(new SendMessageCommand({
            //     QueueUrl: process.env.EXECUTION_QUEUE_URL,
            //     MessageBody: JSON.stringify(message),
            //     MessageDeduplicationId: message.executionId,
            //     MessageGroupId: message.runId,
            // }));
            console.warn('[queue] prod SQS send not yet implemented — falling back to local processing');
            await this.processLocally(message);
        }
    },

    /**
     * Process a queue message directly (the Lambda handler body in prod).
     * Called from:
     *   - send() in local mode (inline)
     *   - SQS-triggered Lambda worker in prod (future)
     */
    async processLocally(message: QueueMessage): Promise<void> {
        switch (message.type) {
            case 'EXECUTE_RUN':
                await executionEngine.handleRunExecution(message.runId, message.executionId);
                break;

            case 'EXECUTE_NODE':
                await executionEngine.handleNodeExecution(message.runId, message.nodeId, message.executionId);
                break;

            default: {
                const _exhaustive: never = message;
                console.warn('[queue] processLocally: unknown message type', _exhaustive);
            }
        }
    },
};
