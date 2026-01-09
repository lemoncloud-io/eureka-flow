import * as React from 'react';

import { cn } from '@lemon/lib/utils';

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
                    'w-full bg-background border border-gray-400 text-gray-900 font-medium rounded-lg px-5 py-4 h-[54px] focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-gray-600 text-base transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-gray-200',
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
