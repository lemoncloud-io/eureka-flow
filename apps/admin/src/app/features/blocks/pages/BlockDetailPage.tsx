import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

import { Button, Card, CardContent, CardHeader, CardTitle, Separator } from '@flows/ui-kit';

import { BlockForm } from '../components/BlockForm';
import { ConfigEditor } from '../components/ConfigEditor';
import { PortEditor } from '../components/PortEditor';
import { useBlocksQuery, useCreateBlockMutation, useUpdateBlockMutation } from '../hooks';

import type { BlockFormData, ConfigItem, Port } from '../types';

const EMPTY_FORM: BlockFormData = {
    stereo: 'process',
    name: '',
    label: '',
    icon: '',
    description: '',
    order: 0,
    processType: '',
    input$: [],
    output$: [],
    config$: [],
    isFrontend: false,
};

export const BlockDetailPage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const isNew = id === 'new';

    const { data: blocks = [], isLoading } = useBlocksQuery();
    const block = !isNew && id ? blocks.find(b => b.id === id) : undefined;
    const createBlock = useCreateBlockMutation();
    const updateBlock = useUpdateBlockMutation();
    const isSaving = createBlock.isPending || updateBlock.isPending;

    const [formData, setFormData] = useState<BlockFormData>(EMPTY_FORM);

    useEffect(() => {
        if (isNew || !block) return;
        const { id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, ...rest } = block;
        setFormData(rest);
    }, [block, isNew]);

    const handleSave = async () => {
        if (!formData.name.trim() || !formData.processType.trim()) {
            toast.error('Name과 Process Type은 필수입니다.');
            return;
        }
        try {
            if (isNew) {
                const created = await createBlock.mutateAsync(formData);
                toast.success('블록이 생성되었습니다.');
                navigate(`/blocks/${created.id}`, { replace: true });
            } else if (id) {
                await updateBlock.mutateAsync({ id, form: formData });
                toast.success('블록이 저장되었습니다.');
            }
        } catch {
            toast.error(isNew ? '블록 생성에 실패했습니다.' : '블록 저장에 실패했습니다.');
        }
    };

    if (!isNew && isLoading) {
        return (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                블록을 불러오는 중…
            </div>
        );
    }

    if (!isNew && !block) {
        return (
            <div className="flex flex-col items-center gap-4 py-20">
                <p className="text-muted-foreground">블록을 찾을 수 없습니다.</p>
                <Button variant="outline" size="sm" onClick={() => navigate('/blocks')}>
                    목록으로
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => navigate('/blocks')}>
                        <ArrowLeft className="mr-1 h-4 w-4" />
                        목록
                    </Button>
                    <h1 className="text-xl font-bold tracking-tight text-foreground">
                        {isNew ? '새 블록 생성' : formData.name}
                    </h1>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => navigate('/blocks')}>
                        취소
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={isSaving}>
                        {isSaving ? (
                            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : (
                            <Save className="mr-1.5 h-4 w-4" />
                        )}
                        저장
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>기본 정보</CardTitle>
                </CardHeader>
                <CardContent>
                    <BlockForm data={formData} onChange={setFormData} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Ports</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-6">
                    <PortEditor
                        label="Input Ports"
                        ports={formData.input$}
                        onChange={(ports: Port[]) => setFormData(prev => ({ ...prev, input$: ports }))}
                    />
                    <Separator />
                    <PortEditor
                        label="Output Ports"
                        ports={formData.output$}
                        onChange={(ports: Port[]) => setFormData(prev => ({ ...prev, output$: ports }))}
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Configuration</CardTitle>
                </CardHeader>
                <CardContent>
                    <ConfigEditor
                        configs={formData.config$}
                        onChange={(configs: ConfigItem[]) => setFormData(prev => ({ ...prev, config$: configs }))}
                    />
                </CardContent>
            </Card>
        </div>
    );
};
