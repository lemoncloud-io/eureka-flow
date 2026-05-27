import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ExternalLink, GitBranch, Maximize2, Plus, Wrench } from 'lucide-react';

import { useActivateToolMutation, useDeactivateToolMutation, useTools } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { Badge, Button, Card, CardContent, Switch } from '@flows/ui-kit';

import { ToolFormDialog } from '../components/ToolFormDialog';

import type { Tool } from '@flows/flows';

const STEREO_CONFIG: Record<Tool['stereo'], { label: string; icon: React.ElementType }> = {
    link: { label: 'Link', icon: ExternalLink },
    embed: { label: 'Embed', icon: Maximize2 },
    flow: { label: 'Flow', icon: GitBranch },
};

export const ToolManagerPage = () => {
    const { t } = useTranslation();
    const { data: toolsData, isLoading } = useTools({ staleTime: 0 });
    const deactivateMutation = useDeactivateToolMutation();
    const activateMutation = useActivateToolMutation();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editTool, setEditTool] = useState<Tool | undefined>();

    const tools = toolsData?.data ?? [];

    const handleToggleActive = (tool: Tool) => {
        if (tool.isActive) {
            deactivateMutation.mutate(tool.id);
        } else {
            activateMutation.mutate(tool.id);
        }
    };

    const handleEdit = (tool: Tool) => {
        setEditTool(tool);
        setDialogOpen(true);
    };

    const handleCreate = () => {
        setEditTool(undefined);
        setDialogOpen(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Wrench className="h-6 w-6 text-primary" />
                    <h1 className="text-2xl font-bold">{t('navigator.tools', 'Tools')}</h1>
                    {tools.length > 0 && <span className="text-sm text-muted-foreground">({tools.length})</span>}
                </div>
                <Button size="sm" onClick={handleCreate} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    {t('navigator.createTool', 'Create Tool')}
                </Button>
            </div>

            {isLoading ? (
                <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
                    ))}
                </div>
            ) : tools.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="p-8 text-center">
                        <p className="text-muted-foreground">
                            {t('navigator.noToolsYet', 'No tools yet. Create your first external tool connection.')}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {tools.map(tool => (
                        <Card key={tool.id} className={cn(!tool.isActive && 'opacity-50')}>
                            <CardContent className="flex items-center gap-4 p-4">
                                {(() => {
                                    const config = STEREO_CONFIG[tool.stereo];
                                    const StereoIcon = config.icon;
                                    return (
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                                            <StereoIcon className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                    );
                                })()}
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <p className="font-medium truncate">{tool.name}</p>
                                        <Badge variant="secondary" className="text-[10px] shrink-0">
                                            {STEREO_CONFIG[tool.stereo].label}
                                        </Badge>
                                    </div>
                                    {tool.urlTemplate && (
                                        <p className="text-[11px] text-muted-foreground/60 mt-0.5 truncate">
                                            {tool.urlTemplate}
                                        </p>
                                    )}
                                    {tool.memo && (
                                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{tool.memo}</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleEdit(tool)}
                                        className="h-7 text-xs"
                                    >
                                        {t('navigator.edit', 'Edit')}
                                    </Button>
                                    <Switch checked={tool.isActive} onCheckedChange={() => handleToggleActive(tool)} />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <ToolFormDialog
                key={editTool?.id ?? 'create'}
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                tool={editTool}
            />
        </div>
    );
};
