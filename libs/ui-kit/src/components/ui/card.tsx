import * as React from 'react';

import { cn } from '../../utils/index';

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn(
            'rounded-[20px] sm:rounded-[26px] overflow-hidden flex flex-col border border-gray-300 bg-card text-card-foreground shadow-custom max-w-full',
            className
        )}
        {...props}
    />
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn(
                'shrink-0 flex items-center border-b border-gray-200 h-[60px] px-4 sm:h-[76px] sm:px-6',
                className
            )}
            {...props}
        />
    )
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn('font-semibold leading-none tracking-tight text-base sm:text-lg', className)}
            {...props}
        />
    )
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div ref={ref} className={cn('text-sm text-muted-foreground mt-1 sm:mt-2', className)} {...props} />
    )
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div ref={ref} className={cn('flex-1 overflow-auto p-4 pt-5', className)} {...props} />
    )
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn(
                'relative flex justify-end gap-2 sticky bottom-0 bg-background py-3 px-4 sm:pb-6 sm:px-[18px]',
                'before:content-[""] before:absolute before:bottom-full before:left-0 before:right-0 before:h-10',
                'before:bg-gradient-to-t before:from-background before:via-background/40 before:to-transparent before:pointer-events-none',
                className
            )}
            {...props}
        />
    )
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
