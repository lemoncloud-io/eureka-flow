/**
 * Node status priority for comparing state updates
 * Higher number = more "final" state
 * Used to prevent race conditions between frontend/socket/API updates
 */
export const STATUS_PRIORITY: Record<string, number> = {
    IDLE: 0,
    READY: 1,
    RUNNING: 2,
    COMPLETED: 3,
    ERROR: 3,
};

/**
 * Get priority value for a status string
 * @param status - Node status string
 * @returns Priority number (-1 if unknown)
 */
export const getStatusPriority = (status?: string): number => {
    return STATUS_PRIORITY[status ?? ''] ?? -1;
};

/**
 * Check if server status should update current status
 * Only updates if server status is equal or higher priority
 * @param current - Current node status
 * @param server - Server-provided status
 * @returns true if should update to server status
 */
export const shouldUpdateStatus = (current?: string, server?: string): boolean => {
    return getStatusPriority(server) >= getStatusPriority(current);
};
