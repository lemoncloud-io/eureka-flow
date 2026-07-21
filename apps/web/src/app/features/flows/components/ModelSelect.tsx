import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown, Loader2, Lock, Sparkles } from 'lucide-react';

import { isMissingAiKey, translateField, useModelOptions } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@flows/ui-kit';
import { useWebCoreStore } from '@flows/web-core';

import type { ConfigOption, LlmModelView } from '@lemoncloud/eureka-flows-api';

interface ModelSelectProps {
    blockType: string;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    /** Denser desktop styling (DetailPanel); default is the larger mobile layout. */
    dense?: boolean;
    /** Static block-def options — native <select> fallback when the catalog is unavailable. */
    fallbackOptions?: ConfigOption[];
}

/** Expected credit cost — uses the app's credit glyph (Sparkles), same as BillingChip. */
const CreditTag = ({ price, unit }: { price: number; unit?: string }) => (
    <span className="flex shrink-0 items-baseline gap-1 text-xs font-medium text-foreground/80">
        <Sparkles className="h-3 w-3 self-center fill-amber-400 text-amber-400" />
        {price}
        {unit && <span className="text-[10px] font-normal text-muted-foreground">{unit}</span>}
    </span>
);

const ModelRow = ({
    model,
    selected,
    isDefault,
    needsKey,
    dense,
    unit,
    onSelect,
    t,
}: {
    model: LlmModelView;
    selected: boolean;
    isDefault: boolean;
    needsKey: boolean;
    dense?: boolean;
    unit?: string;
    onSelect: () => void;
    t: (key: string, defaultValue?: string) => string;
}) => (
    <button
        type="button"
        onClick={onSelect}
        className={cn(
            'flex w-full items-center justify-between gap-2 rounded-md text-left transition-colors',
            dense ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm',
            selected ? 'bg-primary/10' : 'hover:bg-muted/60',
            needsKey && 'opacity-60'
        )}
    >
        <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn('truncate', selected ? 'font-medium text-primary' : 'text-foreground')}>
                {model.label}
            </span>
            {isDefault && (
                <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                    {t('model.default', '기본')}
                </span>
            )}
            {needsKey && (
                <span className="shrink-0" title={t('model.keyRequired', 'API 키 필요')}>
                    <Lock className="h-3 w-3 text-muted-foreground/70" />
                </span>
            )}
        </span>
        <CreditTag price={model.expectedPrice} unit={unit} />
    </button>
);

/**
 * LLM model picker with expected credit cost — shared by the mobile config panel
 * (ConfigFieldList) and the desktop DetailPanel. Shows each model's label + credit cost,
 * a default badge, and a lock for models whose provider key is not registered. Degrades to a
 * native <select> of the block's static options when the catalog is unavailable.
 *
 * TODO: detection relies on the caller matching `field.key === 'model'` + `isAiBlock`.
 * Promote to a server-driven `model-selector` ConfigControlType (like `workflow-selector`)
 * so render sites dispatch on `field.type` instead of a magic key.
 */
export const ModelSelect = ({ blockType, value, onChange, disabled, dense, fallbackOptions }: ModelSelectProps) => {
    const { t } = useTranslation(['flows', 'blocks']);
    const { models, defaultModel, isLoading, shouldFallback, isImage } = useModelOptions(blockType);
    const hasGeminiKey = useWebCoreStore(s => s.hasGeminiKey);
    const hasOpenaiKey = useWebCoreStore(s => s.hasOpenaiKey);
    const [open, setOpen] = useState(false);

    // Price is a normalized "1 standard result" credit estimate (not a per-token rate):
    // image catalog → per generated image, text catalog → per standard run.
    const unit = isImage ? t('model.perImage', '/이미지') : t('model.perRun', '/회');

    const fieldBase = cn(
        'w-full border bg-background text-foreground outline-none transition-colors disabled:cursor-default disabled:opacity-60',
        dense
            ? 'rounded-md border-border/60 bg-background/80 px-2.5 py-2 text-xs focus:border-primary/60'
            : 'h-10 rounded-lg border-border px-3 text-sm focus:ring-2 focus:ring-primary/30'
    );

    if (isLoading) {
        return (
            <div className={cn(fieldBase, 'flex items-center gap-2 text-muted-foreground')}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t('model.loading', '모델 불러오는 중…')}
            </div>
        );
    }

    // Graceful degradation — keep the block's static options working when the catalog is unavailable.
    if (shouldFallback) {
        if (!fallbackOptions?.length) return null;
        return (
            <select className={fieldBase} value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
                {fallbackOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>
                        {translateField(t, opt, 'label')}
                    </option>
                ))}
            </select>
        );
    }

    const selected = models.find(m => m.name === value);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    disabled={disabled}
                    className={cn(fieldBase, 'flex items-center justify-between gap-2')}
                >
                    <span className="truncate">{selected?.label ?? t('model.placeholder', '모델 선택')}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                        {selected && <CreditTag price={selected.expectedPrice} unit={unit} />}
                        <ChevronDown
                            className={cn(
                                'w-3.5 h-3.5 text-muted-foreground transition-transform',
                                open && 'rotate-180'
                            )}
                        />
                    </span>
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                sideOffset={4}
                className="max-h-64 w-[var(--radix-popover-trigger-width)] overflow-y-auto p-1"
            >
                <div className="flex items-center justify-end px-2.5 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                    {t('model.estCredits', '예상 크레딧')}
                </div>
                {models.map(m => (
                    <ModelRow
                        key={m.name}
                        model={m}
                        selected={m.name === value}
                        isDefault={m.name === defaultModel}
                        needsKey={isMissingAiKey(m.name, hasGeminiKey, hasOpenaiKey)}
                        dense={dense}
                        unit={unit}
                        onSelect={() => {
                            onChange(m.name);
                            setOpen(false);
                        }}
                        t={t}
                    />
                ))}
            </PopoverContent>
        </Popover>
    );
};
