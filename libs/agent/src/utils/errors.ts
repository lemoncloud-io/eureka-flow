/** Normalize an unknown thrown value to a message string. Internal to @flows/agent. */
export const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));
