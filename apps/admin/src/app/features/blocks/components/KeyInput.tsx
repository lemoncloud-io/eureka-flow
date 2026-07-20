import { cn } from '@flows/lib/utils';
import { Input } from '@flows/ui-kit';

import { useBlockKeyDictionary } from '../hooks';
import { BLOCK_KEY_LIST_ID } from './BlockKeyDatalist';

interface KeyInputProps {
    value: string | undefined;
    onChange: (value: string | undefined) => void;
    placeholder?: string;
    disabled?: boolean;
}

/**
 * Language key for the text field above it. Blank means "show the original text",
 * which is also what a typo produces — so this shows the translation the key
 * resolves to, says so when it resolves to nothing, and offers the keys that
 * already exist rather than leaving every key to be retyped from memory.
 *
 * The suggestion list itself lives in `BlockKeyDatalist`, mounted once per page.
 */
export const KeyInput = ({ value, onChange, placeholder = 'snake_case', disabled = false }: KeyInputProps) => {
    const { data: dictionary, isError } = useBlockKeyDictionary();
    const translation = value && dictionary ? dictionary[value] : undefined;
    const isUnregistered = !!value && !!dictionary && !translation;

    const hint = () => {
        if (!value) return '원문 사용';
        if (translation) return translation;
        if (isUnregistered) return 'blocks.json에 없음';
        // No dictionary to check against — say so, rather than looking like a pass.
        return isError ? '확인 불가' : '';
    };

    return (
        <div className="flex items-center gap-2">
            <span className="eyebrow shrink-0 text-muted-foreground">key</span>
            <Input
                value={value ?? ''}
                onChange={e => onChange(e.target.value.trim() || undefined)}
                placeholder={placeholder}
                disabled={disabled}
                list={BLOCK_KEY_LIST_ID}
                className={cn('h-7 font-mono text-xs', isUnregistered && 'border-warning')}
            />
            <span
                className={cn(
                    'shrink-0 truncate text-xs',
                    isUnregistered ? 'text-warning' : 'text-muted-foreground',
                    (!value || isError) && 'text-muted-foreground/60'
                )}
                title={translation}
            >
                {hint()}
            </span>
        </div>
    );
};
