import * as React from 'react';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

import { cn } from '../../utils/index';

const Pagination = ({ className, ...props }: React.ComponentProps<'nav'>) => (
    <nav
        role="navigation"
        aria-label="pagination"
        className={cn('flex items-center justify-center gap-2', className)}
        {...props}
    />
);
Pagination.displayName = 'Pagination';

const PaginationContent = React.forwardRef<HTMLUListElement, React.ComponentProps<'ul'>>(
    ({ className, ...props }, ref) => (
        <ul
            ref={ref}
            className={cn('flex items-center gap-[6px] rounded-full py-[6px] px-2 bg-muted', className)}
            {...props}
        />
    )
);
PaginationContent.displayName = 'PaginationContent';

const PaginationItem = React.forwardRef<HTMLLIElement, React.ComponentProps<'li'>>(({ className, ...props }, ref) => (
    <li ref={ref} className={cn('', className)} {...props} />
));
PaginationItem.displayName = 'PaginationItem';

interface PaginationLinkProps extends React.ComponentProps<'button'> {
    isActive?: boolean;
    label?: string;
}

const PaginationLink = ({ className, isActive, children, ...props }: PaginationLinkProps) => (
    <button
        className={cn(
            'w-7 h-7 flex items-center justify-center rounded-full text-base font-medium transition-all duration-200',
            isActive ? 'bg-primary text-primary-foreground' : 'text-foreground hover:text-foreground hover:bg-muted',
            className
        )}
        {...props}
    >
        {children}
    </button>
);
PaginationLink.displayName = 'PaginationLink';

const PaginationPrevious = ({ disabled }: { disabled?: boolean }) => (
    <button
        disabled={disabled}
        className={cn(
            'w-8 h-8 flex items-center justify-center rounded-full transition-colors duration-200',
            disabled
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-foreground text-background hover:bg-foreground/80'
        )}
    >
        <ChevronLeft className="w-5 h-5" />
    </button>
);

const PaginationNext = ({ disabled }: { disabled?: boolean }) => (
    <button
        disabled={disabled}
        className={cn(
            'w-8 h-8 flex items-center justify-center rounded-full transition-colors duration-200',
            disabled
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-foreground text-background hover:bg-foreground/80'
        )}
    >
        <ChevronRight className="w-5 h-5" />
    </button>
);

const PaginationFirst = ({ disabled }: { disabled?: boolean }) => (
    <button
        disabled={disabled}
        className={cn(
            'w-8 h-8 flex items-center justify-center rounded-full transition-colors duration-200',
            disabled
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-foreground text-background hover:bg-foreground/80'
        )}
    >
        <ChevronsLeft className="w-5 h-5" />
    </button>
);

const PaginationLast = ({ disabled }: { disabled?: boolean }) => (
    <button
        disabled={disabled}
        className={cn(
            'w-8 h-8 flex items-center justify-center rounded-full transition-colors duration-200',
            disabled
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-foreground text-background hover:bg-foreground/80'
        )}
    >
        <ChevronsRight className="w-5 h-5" />
    </button>
);

export {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationPrevious,
    PaginationNext,
    PaginationFirst,
    PaginationLast,
};
