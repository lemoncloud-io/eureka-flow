import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ChevronDown, ChevronRight, Filter, Plus, Trash2, X } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { Button, Input } from '@flows/ui-kit';

import { buildTranslationTree } from '../consts';
import { LANGUAGES, LANGUAGE_LABELS } from '../types';

import type { FlatTranslations, Language, TranslationTreeNode } from '../types';

interface TranslationEditorProps {
    edited: Record<Language, FlatTranslations>;
    originals: Record<Language, FlatTranslations>;
    onUpdateValue: (key: string, lang: Language, value: string) => void;
    onAddKey: (key: string, values: Record<Language, string>) => void;
    onDeleteKey: (key: string) => void;
    searchQuery: string;
    focusKey?: string | null;
    onFocusHandled?: () => void;
}

const ITEMS_PER_PAGE = 50;

const EMPTY_VALUES = Object.fromEntries(LANGUAGES.map(l => [l, ''])) as Record<Language, string>;

export const TranslationEditor = ({
    edited,
    originals,
    onUpdateValue,
    onAddKey,
    onDeleteKey,
    searchQuery,
    focusKey,
    onFocusHandled,
}: TranslationEditorProps) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const [page, setPage] = useState(0);
    const [addingKey, setAddingKey] = useState(false);
    const [newKey, setNewKey] = useState('');
    const [newValues, setNewValues] = useState<Record<Language, string>>(() => ({ ...EMPTY_VALUES }));
    const [changedOnly, setChangedOnly] = useState(false);

    const tree = useMemo(() => buildTranslationTree(edited), [edited]);

    const changedKeys = useMemo(() => {
        const keys = new Set<string>();
        const walk = (nodes: TranslationTreeNode[]) => {
            for (const node of nodes) {
                if (
                    node.values &&
                    LANGUAGES.some(lang => originals[lang]?.[node.fullPath] !== edited[lang]?.[node.fullPath])
                ) {
                    keys.add(node.fullPath);
                }
                if (node.children) walk(node.children);
            }
        };
        walk(tree);
        return keys;
    }, [tree, originals, edited]);

    const toggleCollapse = (path: string) => {
        setCollapsed(prev => ({ ...prev, [path]: !prev[path] }));
    };

    const handleAddKey = () => {
        if (!newKey.trim()) return;
        onAddKey(newKey.trim(), newValues);
        setNewKey('');
        setNewValues({ ...EMPTY_VALUES });
        setAddingKey(false);
    };

    // Single pass: collect filtered leaves + count changed
    const { filteredLeaves, changedCount } = useMemo(() => {
        const leaves: TranslationTreeNode[] = [];
        let changed = 0;
        const query = searchQuery.toLowerCase();
        const collect = (nodes: TranslationTreeNode[]) => {
            for (const node of nodes) {
                if (node.values) {
                    const isNodeChanged = changedKeys.has(node.fullPath);
                    if (isNodeChanged) changed++;
                    const matchesSearch =
                        !searchQuery ||
                        node.fullPath.toLowerCase().includes(query) ||
                        LANGUAGES.some(lang => (node.values?.[lang] ?? '').toLowerCase().includes(query));
                    if (matchesSearch && (!changedOnly || isNodeChanged)) {
                        leaves.push(node);
                    }
                }
                if (node.children) collect(node.children);
            }
        };
        collect(tree);
        return { filteredLeaves: leaves, changedCount: changed };
    }, [tree, searchQuery, changedOnly, changedKeys]);

    useEffect(() => setPage(0), [searchQuery, changedOnly]);

    const totalPages = Math.ceil(filteredLeaves.length / ITEMS_PER_PAGE);
    const pagedLeaves = useMemo(
        () => new Set(filteredLeaves.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE).map(l => l.fullPath)),
        [filteredLeaves, page]
    );

    // Focus key: jump to page, scroll, and focus input
    useEffect(() => {
        if (!focusKey) return;
        const idx = filteredLeaves.findIndex(l => l.fullPath === focusKey);
        if (idx === -1) return;
        const targetPage = Math.floor(idx / ITEMS_PER_PAGE);
        setPage(targetPage);
        requestAnimationFrame(() => {
            const row = scrollContainerRef.current?.querySelector(`[data-key="${CSS.escape(focusKey)}"]`);
            if (row) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const input = row.querySelector('input');
                input?.focus();
                row.classList.add('ring-2', 'ring-primary');
                setTimeout(() => row.classList.remove('ring-2', 'ring-primary'), 1500);
            }
            onFocusHandled?.();
        });
    }, [focusKey, filteredLeaves, onFocusHandled]);

    // Pre-compute visible leaf paths for branch visibility checks
    const visibleLeafPaths = useMemo(() => new Set(filteredLeaves.map(l => l.fullPath)), [filteredLeaves]);

    const hasBranchVisible = useCallback(
        (node: TranslationTreeNode): boolean => {
            if (node.values) return visibleLeafPaths.has(node.fullPath);
            return node.children?.some(c => hasBranchVisible(c)) ?? false;
        },
        [visibleLeafPaths]
    );

    const renderTree = (nodes: TranslationTreeNode[], depth = 0): React.ReactNode[] => {
        const result: React.ReactNode[] = [];

        for (const node of nodes) {
            const isCollapsedNode = collapsed[node.fullPath];

            if (node.children && node.children.length > 0) {
                if ((searchQuery || changedOnly) && !node.children.some(c => hasBranchVisible(c))) continue;

                result.push(
                    <tr key={`b-${node.fullPath}`} className="bg-muted/30 hover:bg-muted/50">
                        <td
                            colSpan={LANGUAGES.length + 2}
                            className="px-3 py-1.5 cursor-pointer select-none"
                            onClick={() => toggleCollapse(node.fullPath)}
                            style={{ paddingLeft: `${depth * 16 + 12}px` }}
                        >
                            <div className="flex items-center gap-1.5">
                                {isCollapsedNode ? (
                                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : (
                                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                                <span className="font-semibold text-sm">{node.segment}</span>
                                <span className="text-xs text-muted-foreground ml-1">{node.fullPath}</span>
                            </div>
                        </td>
                    </tr>
                );

                if (!isCollapsedNode) {
                    result.push(...renderTree(node.children, depth + 1));
                }
            } else if (node.values && pagedLeaves.has(node.fullPath)) {
                result.push(
                    <tr
                        key={node.fullPath}
                        data-key={node.fullPath}
                        className="group border-b border-border/50 hover:bg-muted/20 transition-shadow"
                    >
                        <td
                            className="px-3 py-1.5 text-xs font-mono text-muted-foreground whitespace-nowrap align-top"
                            style={{ paddingLeft: `${depth * 16 + 28}px` }}
                        >
                            {node.segment}
                        </td>
                        {LANGUAGES.map(lang => (
                            <td key={lang} className="px-2 py-1">
                                <input
                                    className={cn(
                                        'w-full bg-transparent text-sm px-2 py-1 rounded border border-transparent',
                                        'focus:border-primary focus:outline-none',
                                        originals[lang]?.[node.fullPath] !== edited[lang]?.[node.fullPath] &&
                                            'bg-yellow-500/10 border-yellow-500/30'
                                    )}
                                    value={node.values[lang]}
                                    onChange={e => onUpdateValue(node.fullPath, lang, e.target.value)}
                                />
                            </td>
                        ))}
                        <td className="px-2 py-1 w-8">
                            <button
                                onClick={() => onDeleteKey(node.fullPath)}
                                className="opacity-0 group-hover:opacity-100 p-1 text-destructive hover:bg-destructive/10 rounded transition-opacity"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        </td>
                    </tr>
                );
            }
        }

        return result;
    };

    return (
        <div className="flex flex-col gap-3 flex-1 min-h-0">
            <div ref={scrollContainerRef} className="flex-1 overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card z-10">
                        <tr className="border-b">
                            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-[200px]">
                                Key
                            </th>
                            {LANGUAGES.map(lang => (
                                <th
                                    key={lang}
                                    className="px-3 py-2 text-left text-xs font-medium text-muted-foreground"
                                >
                                    {LANGUAGE_LABELS[lang]} ({lang})
                                </th>
                            ))}
                            <th className="w-8" />
                        </tr>
                    </thead>
                    <tbody>{renderTree(tree)}</tbody>
                </table>
            </div>

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setAddingKey(true)} disabled={addingKey}>
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add Key
                    </Button>
                    <Button
                        variant={changedOnly ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setChangedOnly(v => !v)}
                    >
                        <Filter className="h-3.5 w-3.5 mr-1" />
                        Changed
                        {changedCount > 0 && (
                            <span className="ml-1 text-xs bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 px-1.5 rounded-full">
                                {changedCount}
                            </span>
                        )}
                    </Button>
                    <span className="text-xs text-muted-foreground">{filteredLeaves.length} keys</span>
                </div>
                {totalPages > 1 && (
                    <div className="flex items-center gap-1">
                        <Button variant="outline" size="sm" onClick={() => setPage(0)} disabled={page === 0}>
                            |&lt;
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0}
                        >
                            &lt;
                        </Button>
                        <span className="text-sm text-muted-foreground px-2">
                            {page + 1} / {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                            disabled={page === totalPages - 1}
                        >
                            &gt;
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(totalPages - 1)}
                            disabled={page === totalPages - 1}
                        >
                            &gt;|
                        </Button>
                    </div>
                )}
            </div>

            {addingKey && (
                <div className="flex items-center gap-2 rounded-lg border p-3 bg-muted/20">
                    <Input
                        placeholder="Key (e.g. actions.newAction)"
                        value={newKey}
                        onChange={e => setNewKey(e.target.value)}
                        className="flex-[2]"
                    />
                    {LANGUAGES.map(lang => (
                        <Input
                            key={lang}
                            placeholder={LANGUAGE_LABELS[lang]}
                            value={newValues[lang]}
                            onChange={e => setNewValues(prev => ({ ...prev, [lang]: e.target.value }))}
                            className="flex-[3]"
                        />
                    ))}
                    <Button size="sm" onClick={handleAddKey}>
                        Add
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAddingKey(false)}>
                        <X className="h-3.5 w-3.5" />
                    </Button>
                </div>
            )}
        </div>
    );
};
