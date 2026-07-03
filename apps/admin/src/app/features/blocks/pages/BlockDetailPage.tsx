import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ArrowLeft, Info, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

import { Button, Card, CardContent, CardHeader, CardTitle, Separator } from '@flows/ui-kit';

import { BlockForm } from '../components/BlockForm';
import { ConfigEditor } from '../components/ConfigEditor';
import { PortEditor } from '../components/PortEditor';
import { useBlocksQuery, useCreateBlockMutation } from '../hooks';

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

    const [formData, setFormData] = useState<BlockFormData>(EMPTY_FORM);

    useEffect(() => {
        if (isNew || !block) return;
        const { id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, ...rest } = block;
        setFormData(rest);
    }, [block, isNew]);

    // Existing blocks are read-only: the server rejects remote id-targeted updates.
    const readOnly = !isNew;

    const handleSave = async () => {
        if (readOnly) return;
        if (!formData.name.trim() || !formData.processType.trim()) {
            toast.error('Name과 Process Type은 필수입니다.');
            return;
        }
        try {
            const created = await createBlock.mutateAsync(formData);
            toast.success('블록이 생성되었습니다.');
            navigate(`/blocks/${created.id}`, { replace: true });
        } catch {
            toast.error('블록 생성에 실패했습니다.');
        }
    };

    if (readOnly && isLoading) {
        return (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                블록을 불러오는 중…
            </div>
        );
    }

    if (readOnly && !block) {
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
                    <h1 className="text-2xl font-bold text-foreground">{isNew ? '새 블록 생성' : formData.name}</h1>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => navigate('/blocks')}>
                        {readOnly ? '닫기' : '취소'}
                    </Button>
                    {!readOnly && (
                        <Button size="sm" onClick={handleSave} disabled={createBlock.isPending}>
                            {createBlock.isPending ? (
                                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="mr-1.5 h-4 w-4" />
                            )}
                            저장
                        </Button>
                    )}
                </div>
            </div>

            {readOnly && (
                <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>기존 블록은 읽기 전용입니다. 서버가 원격 수정을 지원하지 않아 조회만 가능합니다.</span>
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>기본 정보</CardTitle>
                </CardHeader>
                <CardContent>
                    <BlockForm data={formData} onChange={setFormData} disabled={readOnly} />
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
                        disabled={readOnly}
                    />
                    <Separator />
                    <PortEditor
                        label="Output Ports"
                        ports={formData.output$}
                        onChange={(ports: Port[]) => setFormData(prev => ({ ...prev, output$: ports }))}
                        disabled={readOnly}
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
                        disabled={readOnly}
                    />
                </CardContent>
            </Card>
        </div>
    );
};
