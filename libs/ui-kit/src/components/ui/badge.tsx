import * as React from 'react';

import { type VariantProps, cva } from 'class-variance-authority';

import { cn } from '../../utils/index';

const badgeVariants = cva(
    'inline-flex items-center justify-center whitespace-nowrap rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
    {
        variants: {
            variant: {
                default: 'bg-muted text-muted-foreground font-medium',
                secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
                green: 'bg-success/10 text-success',
                orange: 'bg-warning/10 text-warning',
                blue: 'bg-info/10 text-info',
                destructive: 'bg-destructive/10 text-destructive',
                outline: 'text-foreground',
            },
            size: {
                default: 'h-5 px-2 py-0.5 text-xs',
                sm: 'h-5 px-2 py-0.5 text-xs',
                lg: 'h-[34px] px-[10px] py-0.5 text-[15px]',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
    return <div className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { Badge, badgeVariants };
