import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Loader2, Plus } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { Button } from '@flows/ui-kit';

import { BlockTable } from '../components/BlockTable';
import { useBlocksQuery } from '../hooks';

import type { BlockStereo } from '../types';

const TABS: { label: string; value: BlockStereo | 'all' }[] = [
    { label: '전체', value: 'all' },
    { label: 'Input', value: 'input' },
    { label: 'Process', value: 'process' },
    { label: 'Output', value: 'output' },
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
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-foreground">블록 관리</h1>
                <Button size="sm" onClick={() => navigate('/blocks/new')}>
                    <Plus className="mr-1.5 h-4 w-4" />새 블록 추가
                </Button>
            </div>

            <div className="flex gap-1 border-b">
                {TABS.map(tab => (
                    <button
                        key={tab.value}
                        onClick={() => setActiveTab(tab.value)}
                        className={cn(
                            'px-4 py-2 text-sm font-medium transition-colors',
                            activeTab === tab.value
                                ? 'border-b-2 border-primary text-primary'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
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
