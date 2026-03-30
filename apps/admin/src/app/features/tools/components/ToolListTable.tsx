import { Code, Database, FileText, Globe, Pencil, Search, Settings, Terminal, Trash2 } from 'lucide-react';

import { Badge, Button, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@flows/ui-kit';

import { useToolStore } from '../stores';

import type { Tool, ToolCategory } from '../types';
import type { LucideIcon } from 'lucide-react';

const CATEGORY_CONFIG: Record<
    ToolCategory,
    { icon: LucideIcon; variant: 'default' | 'secondary' | 'green' | 'blue' | 'orange' | 'outline' }
> = {
    file: { icon: FileText, variant: 'blue' },
    search: { icon: Search, variant: 'green' },
    code: { icon: Code, variant: 'orange' },
    web: { icon: Globe, variant: 'secondary' },
    system: { icon: Terminal, variant: 'default' },
    data: { icon: Database, variant: 'outline' },
    custom: { icon: Settings, variant: 'default' },
};

interface ToolListTableProps {
    tools: Tool[];
    onEdit: (tool: Tool) => void;
    onDelete: (id: string) => void;
}

export const ToolListTable = ({ tools, onEdit, onDelete }: ToolListTableProps) => {
    const updateTool = useToolStore(s => s.updateTool);

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-16">Icon</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead className="w-24">Category</TableHead>
                    <TableHead className="w-20 text-center">활성화</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {tools.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                            Tool이 없습니다.
                        </TableCell>
                    </TableRow>
                )}
                {tools.map(tool => {
                    const config = CATEGORY_CONFIG[tool.category];
                    const CategoryIcon = config.icon;
                    return (
                        <TableRow key={tool.id}>
                            <TableCell>
                                <CategoryIcon className="h-5 w-5 text-muted-foreground" />
                            </TableCell>
                            <TableCell className="font-medium font-mono text-sm text-foreground">{tool.name}</TableCell>
                            <TableCell className="text-foreground">{tool.label}</TableCell>
                            <TableCell>
                                <Badge variant={config.variant}>{tool.category}</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                                <Switch
                                    checked={tool.isEnabled}
                                    onCheckedChange={v => updateTool(tool.id, { isEnabled: v })}
                                />
                            </TableCell>
                            <TableCell className="hidden md:table-cell max-w-xs truncate text-muted-foreground text-sm">
                                {tool.description}
                            </TableCell>
                            <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => onEdit(tool)}
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive hover:text-destructive"
                                        onClick={() => onDelete(tool.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
};
