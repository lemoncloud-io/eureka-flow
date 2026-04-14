import React, { forwardRef, useImperativeHandle, useMemo, useState } from 'react';

import { LayoutGrid, Star } from 'lucide-react';

import { useBlockRegistry } from '@flows/flows';
import { cn } from '@flows/lib/utils';

interface SidebarProps {
    onAddNode: (type: string, customLabel?: string) => void;
    isLoading?: boolean;
}

export interface SidebarRef {
    open: () => void;
}

// ─── 커스텀 블록 정의 ─────────────────────────────────────────────────────────
// 서버 레지스트리에 없는 커스텀 블록을 정의합니다.
// registryLabel: 실제 레지스트리에서 찾을 블록의 레이블 (타입 조회용)
// customLabel:   캔버스에 표시될 이름
// apiNote:       임시 API 항목 (각주 표시용)

interface CustomBlockDef {
    customLabel: string; // 캔버스 표시 이름
    registryLabel: string; // 레지스트리에서 타입 조회 시 사용
    subItems: string[]; // 사이드바 설명 항목
    category: 'inputs' | 'process' | 'outputs';
    apiNote?: string; // * 임시 API (각주용)
}

const CUSTOM_BLOCKS: CustomBlockDef[] = [
    // ── 입력 ──
    {
        customLabel: '트렌드 분석',
        registryLabel: 'Agent Codex',
        category: 'inputs',
        subItems: ['검색 키워드', '수집 기간 (7일/30일 등)', '수집 소스 (네이버, 구글 등 선택)'],
        apiNote: 'Naver Search API',
    },
    // ── 처리 ──
    {
        customLabel: '스크립트 생성',
        registryLabel: 'AI 텍스트',
        category: 'process',
        subItems: ['프롬프트 (어떤 형식의 스크립트인지)', '분량/길이 설정', '언어 설정'],
        apiNote: 'OpenAI API',
    },
    {
        customLabel: '이미지 생성',
        registryLabel: 'AI 이미지',
        category: 'process',
        subItems: ['프롬프트', '이미지 비율/크기', '스타일'],
        apiNote: 'DALL-E API',
    },
    {
        customLabel: '음성 생성',
        registryLabel: 'AI 텍스트', // 음성 전용 블록이 없을 경우 AI 텍스트 사용
        category: 'process',
        subItems: ['음성 선택 (목소리 종류)', '속도', '출력 형식 (mp3 등)'],
        apiNote: 'ElevenLabs API',
    },
    {
        customLabel: '콘텐츠 다운로드',
        registryLabel: 'Html 업로드',
        category: 'process',
        subItems: ['저장 형식 (ZIP / 개별 파일)', '포함 항목 (이미지·음성·스크립트)'],
    },
    // ── 출력 ──
    {
        customLabel: '다운로드 결과',
        registryLabel: 'output-preview', // 타입 직접 지정 폴백용
        category: 'outputs',
        subItems: ['다운로드 완료 여부', '파일 경로', '오류 메시지'],
    },
];

const CATEGORY_CONFIG: Record<'inputs' | 'process' | 'outputs', { label: string }> = {
    inputs: { label: '입력' },
    process: { label: '처리' },
    outputs: { label: '출력' },
};
const CATEGORIES = ['inputs', 'process', 'outputs'] as const;

// ─── Block list item ──────────────────────────────────────────────────────────

const BlockItem: React.FC<{
    block: CustomBlockDef;
    onSelect: () => void;
    disabled?: boolean;
}> = ({ block, onSelect, disabled }) => (
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
        <div className="min-w-0 w-full">
            <p className="text-sm font-medium text-foreground">{block.customLabel}</p>
            {block.subItems.map((item, i) => (
                <p key={i} className="text-xs text-muted-foreground leading-relaxed">
                    {item}
                </p>
            ))}
            {block.apiNote && (
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">* {block.apiNote} 필요 (임시)</p>
            )}
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

    // 레지스트리 레이블 → 타입 조회 맵 (런타임에 서버 데이터 기반으로 생성)
    const labelToType = useMemo(() => {
        const map: Record<string, string> = {};
        Object.values(blockRegistry).forEach(block => {
            map[block.label] = block.type;
        });
        return map;
    }, [blockRegistry]);

    const handleClose = () => setIsOpen(false);

    const handleAddNode = (block: CustomBlockDef) => {
        // 1순위: 레지스트리에서 registryLabel로 타입 조회
        // 2순위: registryLabel 자체를 타입으로 사용 (예: 'output-preview')
        const type = labelToType[block.registryLabel] ?? block.registryLabel;
        onAddNode(type, block.customLabel);
        handleClose();
    };

    const hasApiNote = CUSTOM_BLOCKS.some(b => b.apiNote);

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
                            'sm:absolute sm:inset-auto sm:left-20 sm:top-1/2 sm:-translate-y-1/2 sm:w-60 sm:rounded-2xl sm:max-h-[75vh]',
                            'bg-background border border-border shadow-lg flex flex-col pointer-events-auto',
                            'animate-in fade-in slide-in-from-bottom-4 sm:slide-in-from-left-2 duration-200'
                        )}
                    >
                        {/* Mobile drag handle */}
                        <div className="flex justify-center pt-2 pb-1 sm:hidden">
                            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
                        </div>

                        {/* Block list */}
                        <div className="overflow-y-auto px-4 pb-2 flex-1">
                            {CATEGORIES.map((category, idx) => {
                                const blocks = CUSTOM_BLOCKS.filter(b => b.category === category);
                                if (blocks.length === 0) return null;
                                return (
                                    <div key={category} className={idx > 0 ? 'mt-4' : 'mt-3'}>
                                        <p className="text-sm font-semibold text-foreground mb-1">
                                            {CATEGORY_CONFIG[category].label}
                                        </p>
                                        <div className="h-px bg-border mb-1" />
                                        {blocks.map(block => (
                                            <BlockItem
                                                key={block.customLabel}
                                                block={block}
                                                onSelect={() => handleAddNode(block)}
                                                disabled={isLoading}
                                            />
                                        ))}
                                    </div>
                                );
                            })}
                        </div>

                        {/* 공통 API 각주 */}
                        {hasApiNote && (
                            <div className="px-4 py-2 border-t border-border shrink-0">
                                <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
                                    * 표시된 API는 임시 항목입니다. 실제 연동 전 변경될 수 있습니다.
                                </p>
                            </div>
                        )}
                    </div>
                </>
            )}
        </>
    );
});

Sidebar.displayName = 'Sidebar';
