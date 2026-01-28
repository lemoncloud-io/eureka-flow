import * as React from 'react';

import { cn } from '../../utils/index';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
    ({ className, type, onChange, onKeyDown, ...props }, ref) => {
        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            if (type === 'number' && e.target.value.length > 15) {
                e.target.value = e.target.value.slice(0, 15);
            }
            onChange?.(e);
        };

        const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (type === 'number' && (e.key === '.' || e.key === 'e' || e.key === 'E')) {
                e.preventDefault();
            }
            onKeyDown?.(e);
        };

        return (
            <input
                type={type}
                className={cn(
                    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground',
                    'placeholder:text-muted-foreground',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    'transition-colors',
                    className
                )}
                ref={ref}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                {...props}
            />
        );
    }
);
Input.displayName = 'Input';

export { Input };
