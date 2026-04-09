import { useCallback, useMemo, useState } from 'react';

import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { Button, Input } from '@flows/ui-kit';

import { buildTranslationTree } from '../consts';

import type { FlatTranslations, Language, TranslationTreeNode } from '../types';

interface TranslationEditorProps {
    editedEn: FlatTranslations;
    editedKo: FlatTranslations;
    originalEn: FlatTranslations;
    originalKo: FlatTranslations;
    onUpdateValue: (key: string, lang: Language, value: string) => void;
    onAddKey: (key: string, enValue: string, koValue: string) => void;
    onDeleteKey: (key: string) => void;
    searchQuery: string;
}

const ITEMS_PER_PAGE = 50;

export const TranslationEditor = ({
    editedEn,
    editedKo,
    originalEn,
    originalKo,
    onUpdateValue,
    onAddKey,
    onDeleteKey,
    searchQuery,
}: TranslationEditorProps) => {
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const [page, setPage] = useState(0);
    const [addingKey, setAddingKey] = useState(false);
    const [newKey, setNewKey] = useState('');
    const [newEn, setNewEn] = useState('');
    const [newKo, setNewKo] = useState('');

    const tree = useMemo(() => buildTranslationTree(editedEn, editedKo), [editedEn, editedKo]);

    const isChanged = useCallback(
        (key: string, lang: Language) => {
            const original = lang === 'en' ? originalEn : originalKo;
            const edited = lang === 'en' ? editedEn : editedKo;
            return original[key] !== edited[key];
        },
        [originalEn, originalKo, editedEn, editedKo]
    );

    const toggleCollapse = (path: string) => {
        setCollapsed(prev => ({ ...prev, [path]: !prev[path] }));
    };

    const handleAddKey = () => {
        if (!newKey.trim()) return;
        onAddKey(newKey.trim(), newEn, newKo);
        setNewKey('');
        setNewEn('');
        setNewKo('');
        setAddingKey(false);
    };

    // Collect all leaf nodes for pagination (filtered by search)
    const allLeaves = useMemo(() => {
        const leaves: TranslationTreeNode[] = [];
        const collect = (nodes: TranslationTreeNode[]) => {
            for (const node of nodes) {
                if (node.values) {
                    if (
                        !searchQuery ||
                        node.fullPath.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        node.values.en.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        node.values.ko.toLowerCase().includes(searchQuery.toLowerCase())
                    ) {
                        leaves.push(node);
                    }
                }
                if (node.children) collect(node.children);
            }
        };
        collect(tree);
        return leaves;
    }, [tree, searchQuery]);

    const totalPages = Math.ceil(allLeaves.length / ITEMS_PER_PAGE);
    const pagedLeaves = new Set(
        allLeaves.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE).map(l => l.fullPath)
    );

    // When searching, show flat list; otherwise show tree
    const renderTree = (nodes: TranslationTreeNode[], depth = 0): React.ReactNode[] => {
        const result: React.ReactNode[] = [];

        for (const node of nodes) {
            const isCollapsedNode = collapsed[node.fullPath];

            if (node.children && node.children.length > 0) {
                // Branch node
                const hasVisibleLeaves = searchQuery ? node.children.some(c => hasMatchingLeaf(c)) : true;
                if (!hasVisibleLeaves) continue;

                result.push(
                    <tr key={`branch-${node.fullPath}`} className="bg-muted/30 hover:bg-muted/50">
                        <td
                            colSpan={3}
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
                // Leaf node
                const enChanged = isChanged(node.fullPath, 'en');
                const koChanged = isChanged(node.fullPath, 'ko');

                result.push(
                    <tr key={node.fullPath} className="group border-b border-border/50 hover:bg-muted/20">
                        <td
                            className="px-3 py-1.5 text-xs font-mono text-muted-foreground whitespace-nowrap align-top"
                            style={{ paddingLeft: `${depth * 16 + 28}px` }}
                        >
                            {node.segment}
                        </td>
                        <td className="px-2 py-1">
                            <input
                                className={cn(
                                    'w-full bg-transparent text-sm px-2 py-1 rounded border border-transparent',
                                    'focus:border-primary focus:outline-none',
                                    koChanged && 'bg-yellow-500/10 border-yellow-500/30'
                                )}
                                value={node.values.ko}
                                onChange={e => onUpdateValue(node.fullPath, 'ko', e.target.value)}
                            />
                        </td>
                        <td className="px-2 py-1">
                            <div className="flex items-center gap-1">
                                <input
                                    className={cn(
                                        'flex-1 bg-transparent text-sm px-2 py-1 rounded border border-transparent',
                                        'focus:border-primary focus:outline-none',
                                        enChanged && 'bg-yellow-500/10 border-yellow-500/30'
                                    )}
                                    value={node.values.en}
                                    onChange={e => onUpdateValue(node.fullPath, 'en', e.target.value)}
                                />
                                <button
                                    onClick={() => onDeleteKey(node.fullPath)}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-destructive hover:bg-destructive/10 rounded transition-opacity"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </td>
                    </tr>
                );
            }
        }

        return result;
    };

    const hasMatchingLeaf = (node: TranslationTreeNode): boolean => {
        if (node.values) {
            return (
                node.fullPath.toLowerCase().includes(searchQuery.toLowerCase()) ||
                node.values.en.toLowerCase().includes(searchQuery.toLowerCase()) ||
                node.values.ko.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }
        return node.children?.some(c => hasMatchingLeaf(c)) ?? false;
    };

    return (
        <div className="flex flex-col gap-3 flex-1 min-h-0">
            {/* Table */}
            <div className="flex-1 overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card z-10">
                        <tr className="border-b">
                            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-[240px]">
                                키
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                                한국어 (ko)
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">영어 (en)</th>
                        </tr>
                    </thead>
                    <tbody>{renderTree(tree)}</tbody>
                </table>
            </div>

            {/* Pagination + Add Key */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setAddingKey(true)} disabled={addingKey}>
                        <Plus className="h-3.5 w-3.5 mr-1" />키 추가
                    </Button>
                    <span className="text-xs text-muted-foreground">{allLeaves.length} keys</span>
                </div>
                {totalPages > 1 && (
                    <div className="flex items-center gap-2">
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
                        <span className="text-sm text-muted-foreground">
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

            {/* Add Key Form */}
            {addingKey && (
                <div className="flex items-center gap-2 rounded-lg border p-3 bg-muted/20">
                    <Input
                        placeholder="키 (예: actions.newAction)"
                        value={newKey}
                        onChange={e => setNewKey(e.target.value)}
                        className="flex-[2]"
                    />
                    <Input
                        placeholder="한국어"
                        value={newKo}
                        onChange={e => setNewKo(e.target.value)}
                        className="flex-[3]"
                    />
                    <Input
                        placeholder="English"
                        value={newEn}
                        onChange={e => setNewEn(e.target.value)}
                        className="flex-[3]"
                    />
                    <Button size="sm" onClick={handleAddKey}>
                        추가
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAddingKey(false)}>
                        취소
                    </Button>
                </div>
            )}
        </div>
    );
};
