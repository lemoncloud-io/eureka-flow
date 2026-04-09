import { cn } from '@flows/lib/utils';

import { I18N_NAMESPACES } from '../consts';

import type { I18nNamespace } from '../consts';

interface NamespaceSelectorProps {
    selected: I18nNamespace;
    onChange: (ns: I18nNamespace) => void;
}

export const NamespaceSelector = ({ selected, onChange }: NamespaceSelectorProps) => {
    return (
        <div className="flex gap-1 border-b">
            {I18N_NAMESPACES.map(ns => (
                <button
                    key={ns}
                    onClick={() => onChange(ns)}
                    className={cn(
                        'px-4 py-2 text-sm font-medium transition-colors',
                        selected === ns
                            ? 'border-b-2 border-primary text-primary'
                            : 'text-muted-foreground hover:text-foreground'
                    )}
                >
                    {ns}
                </button>
            ))}
        </div>
    );
};
