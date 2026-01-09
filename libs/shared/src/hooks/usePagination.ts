import { useMemo } from 'react';

export interface UsePaginationProps {
    totalCount: number;
    pageSize: number;
    siblingCount?: number;
    currentPage: number;
}

export type PaginationRange = (number | '...')[];

const range = (start: number, end: number): number[] => {
    const length = end - start + 1;
    return Array.from({ length }, (_, idx) => idx + start);
};

/**
 * Hook to calculate pagination range with ellipsis
 *
 * @param totalCount - Total number of items
 * @param pageSize - Items per page
 * @param siblingCount - Number of siblings on each side of current page (default: 1)
 * @param currentPage - Current page number (1-based)
 * @returns Object containing pagination range array
 */
export const usePagination = ({
    totalCount,
    pageSize,
    siblingCount = 1,
    currentPage,
}: UsePaginationProps): { paginationRange: PaginationRange } => {
    const paginationRange = useMemo((): PaginationRange => {
        const totalPageCount = Math.ceil(totalCount / pageSize);

        // Pages count: firstPage + lastPage + currentPage + 2*siblings + 2*ellipsis
        const totalPageNumbers = siblingCount + 5;

        // Case 1: Number of pages is less than the page numbers we want to show
        if (totalPageNumbers >= totalPageCount) {
            return range(1, totalPageCount);
        }

        const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
        const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPageCount);

        const shouldShowLeftDots = leftSiblingIndex > 2;
        const shouldShowRightDots = rightSiblingIndex < totalPageCount - 2;

        const firstPageIndex = 1;
        const lastPageIndex = totalPageCount;

        // Case 2: No left dots, but right dots
        if (!shouldShowLeftDots && shouldShowRightDots) {
            const leftItemCount = 3 + 2 * siblingCount;
            const leftRange = range(1, leftItemCount);
            return [...leftRange, '...', totalPageCount];
        }

        // Case 3: Left dots, but no right dots
        if (shouldShowLeftDots && !shouldShowRightDots) {
            const rightItemCount = 3 + 2 * siblingCount;
            const rightRange = range(totalPageCount - rightItemCount + 1, totalPageCount);
            return [firstPageIndex, '...', ...rightRange];
        }

        // Case 4: Both left and right dots
        const middleRange = range(leftSiblingIndex, rightSiblingIndex);
        return [firstPageIndex, '...', ...middleRange, '...', lastPageIndex];
    }, [totalCount, pageSize, siblingCount, currentPage]);

    return { paginationRange };
};
