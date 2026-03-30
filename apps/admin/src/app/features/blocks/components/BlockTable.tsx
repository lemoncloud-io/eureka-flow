import { useNavigate } from 'react-router-dom';

import { Pencil, Trash2 } from 'lucide-react';

import { Badge, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@flows/ui-kit';

import { getBlockIcon } from '../consts';

import type { Block, BlockStereo } from '../types';

const STEREO_VARIANT: Record<BlockStereo, 'default' | 'secondary' | 'outline'> = {
    input: 'default',
    process: 'secondary',
    output: 'outline',
};

interface BlockTableProps {
    blocks: Block[];
    onDelete: (id: string) => void;
}

export const BlockTable = ({ blocks, onDelete }: BlockTableProps) => {
    const navigate = useNavigate();

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Process Type</TableHead>
                    <TableHead className="w-24">Stereo</TableHead>
                    <TableHead className="w-20 text-right">Order</TableHead>
                    <TableHead className="w-24 text-center">Frontend</TableHead>
                    <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {blocks.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                            블록이 없습니다.
                        </TableCell>
                    </TableRow>
                )}
                {blocks.map(block => {
                    const Icon = getBlockIcon(block.processType);
                    return (
                        <TableRow
                            key={block.id}
                            className="cursor-pointer"
                            onClick={() => navigate(`/blocks/${block.id}`)}
                        >
                            <TableCell>
                                <Icon className="h-5 w-5 text-muted-foreground" />
                            </TableCell>
                            <TableCell className="font-medium">{block.name}</TableCell>
                            <TableCell className="font-mono text-sm text-muted-foreground">
                                {block.processType}
                            </TableCell>
                            <TableCell>
                                <Badge variant={STEREO_VARIANT[block.stereo]}>{block.stereo}</Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{block.order}</TableCell>
                            <TableCell className="text-center">{block.isFrontend ? 'Yes' : 'No'}</TableCell>
                            <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={e => {
                                            e.stopPropagation();
                                            navigate(`/blocks/${block.id}`);
                                        }}
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive hover:text-destructive"
                                        onClick={e => {
                                            e.stopPropagation();
                                            onDelete(block.id);
                                        }}
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
