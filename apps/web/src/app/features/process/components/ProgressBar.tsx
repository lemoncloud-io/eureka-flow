import { cn } from '@flows/lib/utils';

interface ProgressBarProps {
    value: number;
    className?: string;
}

export const ProgressBar = ({ value, className }: ProgressBarProps) => {
    const clamped = Math.max(0, Math.min(100, value));

    return (
        <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
            <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${clamped}%` }}
            />
        </div>
    );
};
