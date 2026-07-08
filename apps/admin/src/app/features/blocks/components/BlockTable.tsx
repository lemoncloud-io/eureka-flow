import { useNavigate } from 'react-router-dom';

import { ArrowRight, Pencil } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@flows/ui-kit';

import { getBlockIcon } from '../consts';

import type { Block, BlockStereo, Port } from '../types';

const STEREO_STYLE: Record<BlockStereo, string> = {
    input: 'border-port-text/40 bg-port-text/10 text-port-text',
    process: 'border-primary/40 bg-primary/10 text-primary',
    output: 'border-wire/40 bg-wire/10 text-wire',
};

const portColor = (type: string): string => {
    if (type === 'text') return 'bg-port-text';
    if (type === 'image') return 'bg-port-image';
    return 'bg-port-any';
};

const PortDots = ({ ports }: { ports: Port[] }) => {
    if (ports.length === 0) return <span className="text-muted-foreground/40">·</span>;
    const shown = ports.slice(0, 5);
    return (
        <span className="flex items-center gap-1">
            {shown.map((p, i) => (
                <span
                    key={`${p.id}-${i}`}
                    className={cn('h-2 w-2 rounded-full ring-1 ring-inset ring-black/5', portColor(p.type))}
                    title={`${p.id}: ${p.type}`}
                />
            ))}
            {ports.length > shown.length && (
                <span className="font-mono text-[10px] text-muted-foreground">+{ports.length - shown.length}</span>
            )}
        </span>
    );
};

interface BlockTableProps {
    blocks: Block[];
}

export const BlockTable = ({ blocks }: BlockTableProps) => {
    const navigate = useNavigate();

    return (
        <div className="overflow-hidden rounded-lg border bg-card">
            <Table className="[&_thead]:h-auto [&_td]:px-4 [&_td]:py-2.5 [&_th]:px-4 [&_th]:py-2.5 [&_th]:h-auto">
                <TableHeader>
                    <TableRow className="hover:bg-transparent">
                        <TableHead className="w-12"></TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Process Type</TableHead>
                        <TableHead className="w-44">
                            <span className="eyebrow text-muted-foreground/70">in → out</span>
                        </TableHead>
                        <TableHead className="w-24">Stereo</TableHead>
                        <TableHead className="w-16 text-right">Order</TableHead>
                        <TableHead className="w-20 text-center">Frontend</TableHead>
                        <TableHead className="w-14 text-right"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {blocks.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                                블록이 없습니다.
                            </TableCell>
                        </TableRow>
                    )}
                    {blocks.map(block => {
                        const Icon = getBlockIcon(block.processType);
                        return (
                            <TableRow
                                key={block.id}
                                className="group cursor-pointer"
                                onClick={() => navigate(`/blocks/${block.id}`)}
                            >
                                <TableCell>
                                    <span className="flex h-8 w-8 items-center justify-center rounded-md border bg-background text-muted-foreground group-hover:border-primary/40 group-hover:text-primary">
                                        <Icon className="h-4 w-4" />
                                    </span>
                                </TableCell>
                                <TableCell className="font-medium text-foreground">{block.name}</TableCell>
                                <TableCell>
                                    <code className="font-mono text-xs text-muted-foreground">{block.processType}</code>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2 text-muted-foreground/60">
                                        <PortDots ports={block.input$} />
                                        <ArrowRight className="h-3 w-3 shrink-0" />
                                        <PortDots ports={block.output$} />
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <span
                                        className={cn(
                                            'inline-flex rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium',
                                            STEREO_STYLE[block.stereo]
                                        )}
                                    >
                                        {block.stereo}
                                    </span>
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                                    {block.order}
                                </TableCell>
                                <TableCell className="text-center">
                                    <span
                                        className={cn(
                                            'inline-block h-1.5 w-1.5 rounded-full',
                                            block.isFrontend ? 'bg-success' : 'bg-muted-foreground/30'
                                        )}
                                        title={block.isFrontend ? 'frontend' : 'backend'}
                                    />
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 opacity-0 group-hover:opacity-100"
                                        onClick={e => {
                                            e.stopPropagation();
                                            navigate(`/blocks/${block.id}`);
                                        }}
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
};
