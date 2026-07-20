import { cn } from '@flows/lib/utils';
import { Input } from '@flows/ui-kit';

import { useBlockKeyDictionary } from '../hooks';

interface KeyInputProps {
    value: string | undefined;
    onChange: (value: string | undefined) => void;
    placeholder?: string;
    disabled?: boolean;
}

/**
 * Language key for the text field above it. Blank means "show the original text",
 * which is also what a typo produces — so this shows the translation the key
 * resolves to, and says so when it resolves to nothing.
 */
export const KeyInput = ({ value, onChange, placeholder = 'snake_case', disabled = false }: KeyInputProps) => {
    const { data: dictionary } = useBlockKeyDictionary();
    const translation = value && dictionary ? dictionary[value] : undefined;
    const isUnregistered = !!value && !!dictionary && !translation;

    return (
        <div className="flex items-center gap-2">
            <span className="eyebrow shrink-0 text-muted-foreground">key</span>
            <Input
                value={value ?? ''}
                onChange={e => onChange(e.target.value.trim() || undefined)}
                placeholder={placeholder}
                disabled={disabled}
                className={cn('h-7 font-mono text-xs', isUnregistered && 'border-warning')}
            />
            <span
                className={cn(
                    'shrink-0 truncate text-xs',
                    isUnregistered ? 'text-warning' : 'text-muted-foreground',
                    !value && 'text-muted-foreground/60'
                )}
                title={translation}
            >
                {!value ? '원문 사용' : (translation ?? (isUnregistered ? 'blocks.json에 없음' : ''))}
            </span>
        </div>
    );
};
