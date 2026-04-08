/**
 * GET / (root, no prefix)
 * Caller: libs/flows/src/api/system.ts → getSystemInfo()
 *
 * Response is plain text, not JSON:
 *   eureka-flows-api/0.26.227b
 *   lemon-core/4.1.15
 *
 * No zod schema needed — just documenting the contract.
 */
export const SYSTEM_INFO_FORMAT = 'plain text: name/version per line' as const;
