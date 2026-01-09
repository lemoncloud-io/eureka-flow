/**
 * Generic list response type for paginated API results
 */
export interface ListResult<T, R = unknown> {
    total?: number;
    limit?: number;
    page?: number;
    took?: number;
    list: T[];
    aggr?: R[];
}

/**
 * Pagination state with data
 */
export interface PaginationType<T> {
    page: number | undefined;
    total: number | undefined;
    data: T;
}

/**
 * Common API parameters
 */
export interface Params {
    [key: string]: string | number | boolean | undefined;
}
