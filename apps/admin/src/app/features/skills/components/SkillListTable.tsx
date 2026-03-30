import { Pencil, Sparkles, Trash2 } from 'lucide-react';

import { Badge, Button, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@flows/ui-kit';

import { useToolStore } from '../../tools';
import { useSkillStore } from '../stores';

import type { Skill } from '../types';

const MAX_VISIBLE_TOOLS = 3;

interface SkillListTableProps {
    skills: Skill[];
    onEdit: (skill: Skill) => void;
    onDelete: (id: string) => void;
}

export const SkillListTable = ({ skills, onEdit, onDelete }: SkillListTableProps) => {
    const updateSkill = useSkillStore(s => s.updateSkill);
    const tools = useToolStore(s => s.tools);

    const getToolLabel = (toolId: string) => {
        const tool = tools.find(t => t.id === toolId);
        return tool?.label ?? toolId;
    };

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-16">Icon</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Tools</TableHead>
                    <TableHead className="w-20 text-center">활성화</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {skills.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                            Skill이 없습니다.
                        </TableCell>
                    </TableRow>
                )}
                {skills.map(skill => (
                    <TableRow key={skill.id}>
                        <TableCell>
                            <Sparkles className="h-5 w-5 text-muted-foreground" />
                        </TableCell>
                        <TableCell className="font-medium font-mono text-sm text-foreground">{skill.name}</TableCell>
                        <TableCell className="text-foreground">{skill.label}</TableCell>
                        <TableCell>
                            <div className="flex flex-wrap gap-1">
                                {skill.toolIds.slice(0, MAX_VISIBLE_TOOLS).map(id => (
                                    <Badge key={id} variant="blue" size="sm">
                                        {getToolLabel(id)}
                                    </Badge>
                                ))}
                                {skill.toolIds.length > MAX_VISIBLE_TOOLS && (
                                    <Badge variant="outline" size="sm">
                                        +{skill.toolIds.length - MAX_VISIBLE_TOOLS}
                                    </Badge>
                                )}
                            </div>
                        </TableCell>
                        <TableCell className="text-center">
                            <Switch
                                checked={skill.isEnabled}
                                onCheckedChange={v => updateSkill(skill.id, { isEnabled: v })}
                            />
                        </TableCell>
                        <TableCell className="hidden md:table-cell max-w-xs truncate text-muted-foreground text-sm">
                            {skill.description}
                        </TableCell>
                        <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(skill)}>
                                    <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    onClick={() => onDelete(skill.id)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
};
