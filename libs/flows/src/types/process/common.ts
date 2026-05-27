export type Status = 'todo' | 'doing' | 'done' | 'hold' | 'skip';

export type Timestamp = number;

export type ErrorCode =
    // 404 family
    | 'PROCESS_NOT_FOUND'
    | 'ITEM_NOT_FOUND'
    | 'STAGE_NOT_FOUND'
    | 'TASK_NOT_FOUND'
    | 'NOTE_NOT_FOUND'
    | 'ACTOR_NOT_FOUND'
    | 'TOOL_NOT_FOUND'
    // 400 family
    | 'VALIDATION_FAILED'
    | 'NAME_REQUIRED'
    | 'INVALID_STEREO'
    | 'STEREO_IMMUTABLE'
    | 'INVALID_STATUS_TRANSITION'
    | 'INVALID_TOOL_CONFIG'
    // 409 family
    | 'DUPLICATE_NAME'
    // 5xx family
    | 'INTERNAL_ERROR';

export interface ProcessApiResponse<T> {
    data: T;
    warnings?: string[];
    meta?: Record<string, unknown>;
}

export interface ProcessApiListResponse<T> {
    data: T[];
    warnings?: string[];
    meta?: {
        page: number;
        pageSize: number;
        total: number;
    };
}

export interface ProcessApiError {
    error: {
        code: ErrorCode;
        message: string;
        details?: string[];
    };
}
