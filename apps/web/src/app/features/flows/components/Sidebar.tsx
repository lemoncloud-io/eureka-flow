import React, { forwardRef, useImperativeHandle, useMemo, useState } from 'react';

import { LayoutGrid, Star } from 'lucide-react';

import { isOutputBlock, useBlockRegistry } from '@flows/flows';
import { cn } from '@flows/lib/utils';

interface SidebarProps {
    onAddNode: (type: string) => void;
    isLoading?: boolean;
}

export interface SidebarRef {
    open: () => void;
}

// ─── 표시할 블록 라벨 목록 (순서 유지) ──────────────────────────────────────

const DESIRED_LABELS = ['트렌드 분석', '스크립트 생성', '이미지 생성', '음성 생성', '콘텐츠 다운로드', '다운로드 결과'];

const CATEGORY_CONFIG = {
    inputs: { label: '입력' },
    process: { label: '처리' },
    outputs: { label: '출력' },
} as const;
const CATEGORIES = Object.keys(CATEGORY_CONFIG) as Array<keyof typeof CATEGORY_CONFIG>;

// ─── Block list item ──────────────────────────────────────────────────────────

const BlockItem: React.FC<{
    label: string;
    subItems: string[];
    onSelect: () => void;
    disabled?: boolean;
}> = ({ label, subItems, onSelect, disabled }) => (
    <button
        onClick={onSelect}
        disabled={disabled}
        className={cn(
            'w-full text-left py-3 flex gap-3 items-start',
            'border-b border-border last:border-0',
            'hover:bg-accent/30 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
    >
        <Star className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{label}</p>
            {subItems.map((item, i) => (
                <p key={i} className="text-xs text-muted-foreground leading-relaxed">
                    {item}
                </p>
            ))}
        </div>
    </button>
);

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export const Sidebar = forwardRef<SidebarRef, SidebarProps>(({ onAddNode, isLoading }, ref) => {
    const blockRegistry = useBlockRegistry();
    const [isOpen, setIsOpen] = useState(false);

    useImperativeHandle(ref, () => ({
        open: () => setIsOpen(true),
    }));

    const blockGroups = useMemo(() => {
        // 모든 블록 (중복 제거)
        const allBlocks = Object.entries(blockRegistry)
            .filter(([key, block]) => key === block.type)
            .map(([, block]) => block);

        // DESIRED_LABELS에 있는 블록만 필터 (없으면 전체 표시)
        const desired = allBlocks.filter(b => DESIRED_LABELS.includes(b.label));
        const blocks = desired.length > 0 ? desired : allBlocks;

        // 카테고리별 분류
        const inputs = blocks.filter(b => b.stereo === 'input' || (!b.stereo && b.type.startsWith('input-')));
        const outputs = blocks.filter(b => b.stereo === 'output' || (!b.stereo && isOutputBlock(b.type)));
        const process = blocks.filter(b => !inputs.includes(b) && !outputs.includes(b));

        return { inputs, process, outputs };
    }, [blockRegistry]);

    const getSubItems = (block: (typeof blockRegistry)[string]): string[] => {
        if (block.configSchema && block.configSchema.length > 0) {
            return block.configSchema.filter(f => f.type !== 'separator').map(f => f.label);
        }
        if (block.inputs && block.inputs.length > 0) {
            return block.inputs.map(p => p.label).filter((l): l is string => Boolean(l));
        }
        return block.description ? [block.description] : [];
    };

    const handleClose = () => setIsOpen(false);

    const handleAddNode = (type: string) => {
        onAddNode(type); // 캔버스에 노드 추가 + 자동 선택 → DetailPanel 오픈
        handleClose();
    };

    return (
        <>
            {/* Library toggle button */}
            <div className="absolute left-2 sm:left-4 bottom-4 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 z-30 pointer-events-auto">
                <div
                    className={cn(
                        'flex flex-col gap-2 p-1.5 sm:p-2 rounded-xl sm:rounded-2xl',
                        'bg-glass-bg backdrop-blur-[24px] border border-glass-border shadow-floating'
                    )}
                >
                    <button
                        title="라이브러리"
                        onClick={() => setIsOpen(v => !v)}
                        className={cn(
                            'w-9 h-9 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-all duration-150 hover:bg-accent',
                            isOpen
                                ? 'bg-glass-bg text-primary shadow-md'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        <LayoutGrid className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Block list panel */}
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-10 bg-black/20 sm:bg-transparent" onClick={handleClose} />
                    <div
                        className={cn(
                            'fixed inset-x-0 bottom-0 z-20 rounded-t-2xl max-h-[80vh]',
                            'sm:absolute sm:inset-auto sm:left-20 sm:top-1/2 sm:-translate-y-1/2 sm:w-56 sm:rounded-2xl sm:max-h-[70vh]',
                            'bg-background border border-border shadow-lg flex flex-col pointer-events-auto',
                            'animate-in fade-in slide-in-from-bottom-4 sm:slide-in-from-left-2 duration-200'
                        )}
                    >
                        <div className="flex justify-center pt-2 pb-1 sm:hidden">
                            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
                        </div>
                        <div className="overflow-y-auto px-4 pb-4">
                            {CATEGORIES.map((category, idx) => {
                                const blocks = blockGroups[category];
                                if (blocks.length === 0) return null;
                                return (
                                    <div key={category} className={idx > 0 ? 'mt-4' : 'mt-3'}>
                                        <p className="text-sm font-semibold text-foreground mb-1">
                                            {CATEGORY_CONFIG[category].label}
                                        </p>
                                        <div className="h-px bg-border mb-1" />
                                        {blocks.map(block => (
                                            <BlockItem
                                                key={block.type}
                                                label={block.label}
                                                subItems={getSubItems(block)}
                                                onSelect={() => handleAddNode(block.type)}
                                                disabled={isLoading}
                                            />
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </>
    );
});

Sidebar.displayName = 'Sidebar';
