import { useMemo } from 'react';

import { Copy } from 'lucide-react';
import { toast } from 'sonner';

import { Button, JsonViewer } from '@flows/ui-kit';

import { toJsonSchema } from '../utils';

import type { ToolParameter } from '../types';

interface SchemaPreviewProps {
    name: string;
    description: string;
    parameters: ToolParameter[];
}

export const SchemaPreview = ({ name, description, parameters }: SchemaPreviewProps) => {
    const schema = useMemo(() => toJsonSchema(parameters), [parameters]);

    const toolDefinition = useMemo(
        () => ({
            name: name || 'tool_name',
            description: description || '',
            input_schema: schema,
        }),
        [name, description, schema]
    );

    const handleCopy = () => {
        navigator.clipboard.writeText(JSON.stringify(toolDefinition, null, 2));
        toast.success('스키마가 클립보드에 복사되었습니다.');
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">JSON Schema Preview</h3>
                <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                    <Copy className="mr-1 h-4 w-4" />
                    복사
                </Button>
            </div>
            <div className="rounded-md border bg-muted/30 p-2">
                <JsonViewer data={toolDefinition} maxHeight={300} collapsed={3} />
            </div>
        </div>
    );
};
