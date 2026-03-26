import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';

import { Button, Card, CardContent, CardHeader, CardTitle, Separator } from '@flows/ui-kit';

import { BlockForm } from '../components/BlockForm';
import { ConfigEditor } from '../components/ConfigEditor';
import { PortEditor } from '../components/PortEditor';
import { useBlockStore } from '../stores';

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

    const block = useBlockStore(s => (!isNew && id ? s.blocks.find(b => b.id === id) : undefined));
    const addBlock = useBlockStore(s => s.addBlock);
    const updateBlock = useBlockStore(s => s.updateBlock);

    const [formData, setFormData] = useState<BlockFormData>(EMPTY_FORM);

    useEffect(() => {
        if (isNew) return;
        if (!block) {
            toast.error('블록을 찾을 수 없습니다.');
            navigate('/blocks', { replace: true });
            return;
        }
        const { id: _, createdAt: __, updatedAt: ___, deletedAt: ____, ...rest } = block;
        setFormData(rest);
    }, [block, isNew, navigate]);

    const handleSave = () => {
        if (!formData.name.trim() || !formData.processType.trim()) {
            toast.error('Name과 Process Type은 필수입니다.');
            return;
        }

        if (isNew) {
            const created = addBlock(formData);
            toast.success('블록이 생성되었습니다.');
            navigate(`/blocks/${created.id}`, { replace: true });
        } else {
            if (id) updateBlock(id, formData);
            toast.success('블록이 저장되었습니다.');
        }
    };

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
                        취소
                    </Button>
                    <Button size="sm" onClick={handleSave}>
                        <Save className="mr-1.5 h-4 w-4" />
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
