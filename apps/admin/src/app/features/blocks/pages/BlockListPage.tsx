import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Loader2, Plus } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { Button } from '@flows/ui-kit';

import { BlockTable } from '../components/BlockTable';
import { useBlocksQuery } from '../hooks';

import type { BlockStereo } from '../types';

const TABS: { label: string; value: BlockStereo | 'all' }[] = [
    { label: 'all', value: 'all' },
    { label: 'input', value: 'input' },
    { label: 'process', value: 'process' },
    { label: 'output', value: 'output' },
];

export const BlockListPage = () => {
    const navigate = useNavigate();
    const { data: blocks = [], isLoading, error } = useBlocksQuery();

    const [activeTab, setActiveTab] = useState<BlockStereo | 'all'>('all');

    const filteredBlocks = useMemo(() => {
        const sorted = [...blocks].sort((a, b) => a.order - b.order);
        if (activeTab === 'all') return sorted;
        return sorted.filter(b => b.stereo === activeTab);
    }, [blocks, activeTab]);

    return (
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
            <div className="flex items-end justify-between">
                <div className="flex flex-col gap-1">
                    <span className="eyebrow text-primary">registry</span>
                    <h1 className="text-xl font-bold tracking-tight text-foreground">블록 관리</h1>
                </div>
                <Button size="sm" onClick={() => navigate('/blocks/new')}>
                    <Plus className="mr-1.5 h-4 w-4" />새 블록 추가
                </Button>
            </div>

            <div className="flex items-center gap-1.5 border-b pb-px">
                {TABS.map(tab => {
                    const active = activeTab === tab.value;
                    return (
                        <button
                            key={tab.value}
                            onClick={() => setActiveTab(tab.value)}
                            className={cn(
                                'rounded-md px-3 py-1.5 font-mono text-xs transition-colors',
                                active
                                    ? 'bg-accent text-primary'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            )}
                        >
                            {tab.label}
                        </button>
                    );
                })}
                {!isLoading && (
                    <span className="ml-auto font-mono text-xs text-muted-foreground">
                        {filteredBlocks.length} blocks
                    </span>
                )}
            </div>

            {isLoading ? (
                <div className="flex h-40 items-center justify-center text-muted-foreground">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    블록을 불러오는 중…
                </div>
            ) : error ? (
                <div className="flex h-40 items-center justify-center text-destructive">
                    블록을 불러오지 못했습니다.
                </div>
            ) : (
                <BlockTable blocks={filteredBlocks} />
            )}
        </div>
    );
};
