import { useTranslation } from 'react-i18next';

import { Button, cn } from '@flows/ui-kit';

import type { CreditFilter } from '../types';

interface CreditFilterTabsProps {
    value: CreditFilter;
    onChange: (filter: CreditFilter) => void;
}

const FILTERS: CreditFilter[] = ['all', 'use', 'purchase', 'gain', 'cancel'];

/**
 * Inline segmented filter for the usage Sheet. ui-kit has no Tabs component, so
 * this is a simple row of ghost Buttons; the active one switches to `secondary`.
 */
export const CreditFilterTabs = ({ value, onChange }: CreditFilterTabsProps) => {
    const { t } = useTranslation('common');

    return (
        <div className="flex flex-wrap gap-1">
            {FILTERS.map(filter => (
                <Button
                    key={filter}
                    type="button"
                    size="sm"
                    variant={value === filter ? 'secondary' : 'ghost'}
                    className={cn('h-7 px-3 text-xs', value === filter && 'font-semibold')}
                    onClick={() => onChange(filter)}
                >
                    {t(`credits.filter.${filter}`)}
                </Button>
            ))}
        </div>
    );
};
