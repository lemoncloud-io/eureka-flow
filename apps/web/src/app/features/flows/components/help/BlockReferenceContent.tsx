import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronRight, Cpu, Search } from 'lucide-react';

import { blockMatchesQuery, translateField, useBlocks } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { MarkdownViewer } from '@flows/ui-kit';

import { BlockIcon } from '../BlockIcon';

import type { BlockDefinitionWithFrontend } from '@flows/flows';

const CATEGORY_ORDER = ['input', 'process', 'output'] as const;

interface BlockItemProps {
    block: BlockDefinitionWithFrontend;
    isSelected: boolean;
    onClick: () => void;
}

const BlockItem = ({ block, isSelected, onClick }: BlockItemProps) => {
    const { t } = useTranslation(['flows', 'blocks']);

    return (
        <button
            onClick={onClick}
            className={cn(
                'w-full text-left p-3 rounded-lg transition-colors border',
                isSelected ? 'bg-primary/10 border-primary/50' : 'border-transparent hover:bg-muted/50'
            )}
        >
            <div className="flex items-center gap-2">
                <BlockIcon icon={block.icon} size={20} fallback={<span className="text-lg">📦</span>} />
                <span className="font-medium text-sm">{translateField(t, block, 'label')}</span>
                {block.isFrontend && (
                    <span className="ml-auto flex items-center gap-1 text-xs text-primary">
                        <Cpu className="w-3 h-3" />
                        {t('flows:help.blocks.frontend')}
                    </span>
                )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{translateField(t, block, 'description')}</p>
        </button>
    );
};

interface BlockDetailProps {
    block: BlockDefinitionWithFrontend;
}

const BlockDetail = ({ block }: BlockDetailProps) => {
    const { t } = useTranslation(['flows', 'blocks']);

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <BlockIcon icon={block.icon} size={28} fallback={<span className="text-2xl">📦</span>} />
                <div>
                    <h3 className="font-semibold">{translateField(t, block, 'label')}</h3>
                    <p className="text-xs text-muted-foreground">{block.type}</p>
                </div>
            </div>

            <div className="text-sm text-muted-foreground">
                <MarkdownViewer
                    content={translateField(t, block, 'description')}
                    className="[&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_p]:text-sm [&_code]:text-xs"
                />
            </div>

            {block.isFrontend && (
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="flex items-center gap-2 text-primary text-sm font-medium">
                        <Cpu className="w-4 h-4" />
                        {t('flows:help.blocks.frontend')}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{t('flows:help.blocks.frontendDescription')}</p>
                </div>
            )}

            {block.inputs && block.inputs.length > 0 && (
                <div>
                    <h4 className="text-sm font-medium mb-2">{t('flows:help.blocks.inputs')}</h4>
                    <div className="space-y-2">
                        {block.inputs.map(input => (
                            <div key={input.id} className="flex items-center justify-between p-2 rounded bg-muted/30">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-primary" />
                                    <span className="text-sm">{translateField(t, input, 'label') || input.id}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">{input.type || 'any'}</span>
                                    {input.required && (
                                        <span className="text-xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                                            {t('flows:help.blocks.required')}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {block.outputs && block.outputs.length > 0 && (
                <div>
                    <h4 className="text-sm font-medium mb-2">{t('flows:help.blocks.outputs')}</h4>
                    <div className="space-y-2">
                        {block.outputs.map(output => (
                            <div key={output.id} className="flex items-center justify-between p-2 rounded bg-muted/30">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-green-500" />
                                    <span className="text-sm">{translateField(t, output, 'label') || output.id}</span>
                                </div>
                                <span className="text-xs text-muted-foreground">{output.type || 'any'}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {block.configSchema && block.configSchema.length > 0 && (
                <div>
                    <h4 className="text-sm font-medium mb-2">{t('flows:help.blocks.config')}</h4>
                    <div className="space-y-2">
                        {block.configSchema.map(config =>
                            config.type === 'separator' ? (
                                <div key={config.key} className="flex items-center gap-2 py-1">
                                    <div className="flex-1 h-px bg-border/50" />
                                    {config.label && (
                                        <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                                            {translateField(t, config, 'label')}
                                        </span>
                                    )}
                                    <div className="flex-1 h-px bg-border/50" />
                                </div>
                            ) : (
                                <div key={config.key} className="p-2 rounded bg-muted/30">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium">
                                            {translateField(t, config, 'label')}
                                        </span>
                                        <span className="text-xs text-muted-foreground">{config.type}</span>
                                    </div>
                                </div>
                            )
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export const BlockReferenceContent = () => {
    const { t } = useTranslation(['flows', 'blocks']);
    const { blockRegistry } = useBlocks();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [selectedBlockType, setSelectedBlockType] = useState<string | null>(null);

    const blocks = useMemo(() => {
        const blockList = Object.values(blockRegistry);
        // Remove duplicates by type (keep first occurrence)
        const seen = new Set<string>();
        return blockList.filter(block => {
            if (seen.has(block.type)) return false;
            seen.add(block.type);
            return true;
        });
    }, [blockRegistry]);

    const filteredBlocks = useMemo(() => {
        const query = searchQuery.toLowerCase();
        return blocks.filter(block => {
            const matchesSearch = !searchQuery || blockMatchesQuery(t, block, query);
            const matchesCategory = !selectedCategory || block.stereo === selectedCategory;

            return matchesSearch && matchesCategory;
        });
    }, [blocks, searchQuery, selectedCategory, t]);

    const selectedBlock = selectedBlockType ? blockRegistry[selectedBlockType] : null;

    const categories = [
        { key: null, label: t('flows:help.blocks.allCategories') },
        ...CATEGORY_ORDER.map(key => ({
            key,
            label: t(`flows:sidebar.${key === 'input' ? 'inputs' : key === 'output' ? 'output' : 'process'}`),
        })),
    ];

    return (
        <div className="flex gap-4 h-[400px]">
            {/* Left: Block List */}
            <div className="w-1/2 flex flex-col">
                <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder={t('flows:help.blocks.searchPlaceholder')}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className={cn(
                            'w-full pl-9 pr-3 py-2 text-sm',
                            'bg-muted/50 border border-border rounded-lg',
                            'focus:outline-none focus:ring-2 focus:ring-primary/50'
                        )}
                    />
                </div>

                <div className="flex gap-1 mb-3">
                    {categories.map(({ key, label }) => (
                        <button
                            key={key ?? 'all'}
                            onClick={() => setSelectedCategory(key)}
                            className={cn(
                                'px-2 py-1 text-xs rounded-md transition-colors',
                                selectedCategory === key
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted/50 hover:bg-muted'
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto space-y-1 pr-2">
                    {filteredBlocks.length === 0 ? (
                        <div className="text-sm text-muted-foreground text-center py-8">
                            {t('flows:help.blocks.noResults')}
                        </div>
                    ) : (
                        filteredBlocks.map(block => (
                            <BlockItem
                                key={block.type}
                                block={block}
                                isSelected={selectedBlockType === block.type}
                                onClick={() => setSelectedBlockType(block.type)}
                            />
                        ))
                    )}
                </div>
            </div>

            {/* Right: Block Detail */}
            <div className="w-1/2 border-l border-border pl-4 overflow-y-auto">
                {selectedBlock ? (
                    <BlockDetail block={selectedBlock} />
                ) : (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                        <div className="text-center">
                            <ChevronRight className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p>{t('flows:help.blocks.selectToView')}</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
