import { useNavigate } from 'react-router-dom';

import { ArrowRight, Cpu, Download, Upload } from 'lucide-react';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@flows/ui-kit';

import { useBlocksQuery } from '../../blocks';

export const DashboardPage = () => {
    const navigate = useNavigate();
    const { data: blocks = [] } = useBlocksQuery();

    const inputCount = blocks.filter(b => b.stereo === 'input').length;
    const processCount = blocks.filter(b => b.stereo === 'process').length;
    const outputCount = blocks.filter(b => b.stereo === 'output').length;

    return (
        <div className="flex flex-col gap-6">
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <div className="grid grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Input Blocks</CardTitle>
                        <Download className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold">{inputCount}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Process Blocks</CardTitle>
                        <Cpu className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold">{processCount}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Output Blocks</CardTitle>
                        <Upload className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold">{outputCount}</p>
                    </CardContent>
                </Card>
            </div>
            <Button className="w-fit" variant="outline" onClick={() => navigate('/blocks')}>
                블록 관리로 이동
                <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
        </div>
    );
};
