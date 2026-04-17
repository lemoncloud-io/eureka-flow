import { cn } from '@flows/lib/utils';

interface NamespaceSelectorProps {
    namespaces: string[];
    selected: string;
    onChange: (ns: string) => void;
    matchCounts?: Partial<Record<string, number>>;
}

export const NamespaceSelector = ({ namespaces, selected, onChange, matchCounts }: NamespaceSelectorProps) => {
    return (
        <div className="flex gap-1 border-b">
            {namespaces.map(ns => {
                const count = matchCounts?.[ns];
                return (
                    <button
                        key={ns}
                        onClick={() => onChange(ns)}
                        className={cn(
                            'px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5',
                            selected === ns
                                ? 'border-b-2 border-primary text-primary'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {ns}
                        {count != null && count > 0 && (
                            <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full leading-none">
                                {count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
};
