import { useTranslation } from 'react-i18next';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

interface CustomPaginationProps {
    currentPage: number;
    totalPages: number;
    pageSize: number;
    totalItems: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
    pageSizeOptions?: number[];
    isInsideCard?: boolean;
    size?: 'default' | 'sm';
}

export const CustomPagination = ({
    currentPage,
    totalPages,
    pageSize,
    totalItems,
    onPageChange,
    onPageSizeChange,
    pageSizeOptions = [10, 20, 30, 50, 100],
    isInsideCard = false,
    size = 'sm',
}: CustomPaginationProps) => {
    const { t } = useTranslation();
    const isSmall = size === 'sm';
    const getVisiblePages = () => {
        const delta = 2;
        const range = [];
        const rangeWithDots = [];

        for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
            range.push(i);
        }

        if (currentPage - delta > 2) {
            rangeWithDots.push(1, '...');
        } else {
            rangeWithDots.push(1);
        }

        rangeWithDots.push(...range);

        if (currentPage + delta < totalPages - 1) {
            rangeWithDots.push('...', totalPages);
        } else {
            rangeWithDots.push(totalPages);
        }

        return rangeWithDots.filter((item, index, arr) => arr.indexOf(item) === index);
    };

    const visiblePages = totalPages > 1 ? getVisiblePages() : [1];

    // Size-based styling
    const containerPadding = isSmall ? 'px-4 py-3 gap-2' : 'px-6 py-5 gap-3';
    const pageSizeBoxStyle = isSmall ? 'h-7 w-auto px-2 py-1 text-xs' : 'h-10 w-[196px] px-[10px] py-[6px] text-base';
    const navButtonSize = isSmall ? 'w-6 h-6' : 'w-8 h-8';
    const navIconSize = isSmall ? 'h-3.5 w-3.5' : 'h-5 w-5';
    const pageButtonSize = isSmall ? 'h-5 w-5 text-xs' : 'h-7 w-7 text-base';
    const pageContainerPadding = isSmall ? 'py-1 px-1.5 gap-1' : 'py-[6px] px-2 gap-[6px]';
    const marginRight = isSmall ? 'sm:mr-[calc(120px+0.5rem)]' : 'sm:mr-[calc(196px+0.75rem)]';

    return (
        <div
            className={`flex items-center justify-center mt-auto overflow-auto ${containerPadding} ${
                isInsideCard ? 'flex-col' : 'flex-wrap'
            }`}
        >
            <div
                className={`inline-flex items-center rounded-full bg-gray-100 justify-center font-medium text-gray-800 whitespace-nowrap ${pageSizeBoxStyle}`}
            >
                <span>{t('pagination.itemsPerPage')}</span>
                <span className={`shrink-0 text-gray-500 ${isSmall ? 'mx-1' : 'mx-[6px]'}`}>|</span>
                <Select value={pageSize.toString()} onValueChange={value => onPageSizeChange(Number(value))}>
                    <SelectTrigger
                        className={`w-fit border-0 bg-transparent p-0 focus:ring-0 focus:ring-offset-0 text-gray-900 ${
                            isSmall ? 'h-7 text-xs' : 'h-10 text-base'
                        }`}
                    >
                        <SelectValue>
                            {pageSize === -1 ? t('pagination.all') : `${pageSize}${t('pagination.items')}`}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {pageSizeOptions.map(sizeOption => (
                            <SelectItem key={sizeOption} value={sizeOption.toString()}>
                                {sizeOption === -1 ? t('pagination.all') : `${sizeOption}${t('pagination.items')}`}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className={`flex items-center justify-center gap-1.5 ${isInsideCard ? '' : 'flex-1 ' + marginRight}`}>
                <button
                    onClick={() => onPageChange(1)}
                    disabled={currentPage === 1}
                    className={`${navButtonSize} flex items-center justify-center rounded-full border transition-colors duration-200 ${
                        currentPage === 1
                            ? 'bg-white border-gray-300 text-gray-300 cursor-not-allowed'
                            : 'bg-gray-900 border-gray-900 text-white hover:bg-gray-700 hover:border-gray-700'
                    }`}
                >
                    <ChevronsLeft className={navIconSize} />
                </button>
                <button
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={`${navButtonSize} flex items-center justify-center rounded-full border transition-colors duration-200 ${
                        currentPage === 1
                            ? 'bg-white border-gray-300 text-gray-300 cursor-not-allowed'
                            : 'bg-gray-900 border-gray-900 text-white hover:bg-gray-700 hover:border-gray-700'
                    }`}
                >
                    <ChevronLeft className={navIconSize} />
                </button>

                <div className={`flex items-center bg-gray-100 rounded-full ${pageContainerPadding}`}>
                    {visiblePages.map((page, index) => (
                        <button
                            key={index}
                            onClick={() => typeof page === 'number' && onPageChange(page)}
                            disabled={page === '...'}
                            className={`${pageButtonSize} max-md:w-auto max-md:h-auto max-md:px-0 p-0 rounded-full flex items-center justify-center font-medium transition-colors ${
                                page === currentPage
                                    ? 'bg-point text-white'
                                    : page === '...'
                                    ? 'text-gray-400 cursor-default'
                                    : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            {page}
                        </button>
                    ))}
                </div>

                <button
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages || totalPages === 0}
                    className={`${navButtonSize} flex items-center justify-center rounded-full border transition-colors duration-200 ${
                        currentPage === totalPages || totalPages === 0
                            ? 'bg-white border-gray-300 text-gray-300 cursor-not-allowed'
                            : 'bg-gray-900 border-gray-900 text-white hover:bg-gray-700 hover:border-gray-700'
                    }`}
                >
                    <ChevronRight className={navIconSize} />
                </button>
                <button
                    onClick={() => onPageChange(totalPages)}
                    disabled={currentPage === totalPages || totalPages === 0}
                    className={`${navButtonSize} flex items-center justify-center rounded-full border transition-colors duration-200 ${
                        currentPage === totalPages || totalPages === 0
                            ? 'bg-white border-gray-300 text-gray-300 cursor-not-allowed'
                            : 'bg-gray-900 border-gray-900 text-white hover:bg-gray-700 hover:border-gray-700'
                    }`}
                >
                    <ChevronsRight className={navIconSize} />
                </button>
            </div>
        </div>
    );
};
