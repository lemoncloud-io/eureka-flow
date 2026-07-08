import { useNavigate } from 'react-router-dom';

import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, Cpu } from 'lucide-react';

import { cn } from '@flows/lib/utils';

import { useBlocksQuery } from '../../blocks';

import type { LucideIcon } from 'lucide-react';

interface Stage {
    role: string;
    label: string;
    count: number;
    icon: LucideIcon;
    accent: string;
    glow: string;
}

const Connector = () => (
    <div className="relative hidden h-px flex-1 self-center overflow-hidden bg-border lg:block" aria-hidden>
        <span className="absolute top-1/2 h-px w-8 -translate-y-1/2 bg-gradient-to-r from-transparent via-primary to-transparent animate-wire-flow motion-reduce:hidden" />
    </div>
);

const StageNode = ({ stage }: { stage: Stage }) => {
    const Icon = stage.icon;
    return (
        <div className="relative flex-1 overflow-hidden rounded-lg border bg-card p-4">
            <span className={cn('absolute inset-x-0 top-0 h-0.5', stage.accent)} />
            <div className="flex items-center justify-between">
                <span className="eyebrow text-muted-foreground">{stage.role}</span>
                <span className={cn('flex h-8 w-8 items-center justify-center rounded-md', stage.glow)}>
                    <Icon className="h-4 w-4" />
                </span>
            </div>
            <p className="mt-3 font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                {String(stage.count).padStart(2, '0')}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">{stage.label}</p>
        </div>
    );
};

export const DashboardPage = () => {
    const navigate = useNavigate();
    const { data: blocks = [] } = useBlocksQuery();

    const stages: Stage[] = [
        {
            role: 'source',
            label: 'Input blocks',
            count: blocks.filter(b => b.stereo === 'input').length,
            icon: ArrowDownToLine,
            accent: 'bg-port-text',
            glow: 'bg-port-text/10 text-port-text',
        },
        {
            role: 'transform',
            label: 'Process blocks',
            count: blocks.filter(b => b.stereo === 'process').length,
            icon: Cpu,
            accent: 'bg-primary',
            glow: 'bg-primary/10 text-primary',
        },
        {
            role: 'sink',
            label: 'Output blocks',
            count: blocks.filter(b => b.stereo === 'output').length,
            icon: ArrowUpFromLine,
            accent: 'bg-wire',
            glow: 'bg-wire/10 text-wire',
        },
    ];

    const total = blocks.length;
    const frontend = blocks.filter(b => b.isFrontend).length;

    return (
        <div className="mx-auto flex max-w-5xl flex-col gap-5">
            <div className="flex flex-col gap-0.5">
                <span className="eyebrow text-primary">signal flow</span>
                <h1 className="text-xl font-bold tracking-tight text-foreground">Block Registry</h1>
            </div>

            {/* The flow: three stages wired in sequence — the shape of every workflow */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-0">
                <StageNode stage={stages[0]} />
                <Connector />
                <StageNode stage={stages[1]} />
                <Connector />
                <StageNode stage={stages[2]} />
            </div>

            {/* Registry readout */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <ReadoutCell label="total blocks" value={total} />
                <ReadoutCell label="frontend" value={frontend} />
                <ReadoutCell label="backend" value={total - frontend} />
                <button
                    onClick={() => navigate('/blocks')}
                    className="group flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-accent/40"
                >
                    <span className="eyebrow text-muted-foreground">manage</span>
                    <span className="flex items-center gap-1.5 text-sm font-medium text-primary">
                        블록 관리
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                </button>
            </div>
        </div>
    );
};

const ReadoutCell = ({ label, value }: { label: string; value: number }) => (
    <div className="rounded-lg border bg-card px-4 py-3">
        <span className="eyebrow text-muted-foreground">{label}</span>
        <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
);
