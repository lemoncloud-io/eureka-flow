import { Badge } from '@flows/ui-kit';
import { Checkbox } from '@flows/ui-kit';
import { ScrollArea } from '@flows/ui-kit';

import { useToolStore } from '../../tools';

interface ToolSelectorProps {
    selectedIds: string[];
    onChange: (ids: string[]) => void;
}

export const ToolSelector = ({ selectedIds, onChange }: ToolSelectorProps) => {
    const tools = useToolStore(s => s.tools);

    const handleToggle = (id: string) => {
        if (selectedIds.includes(id)) {
            onChange(selectedIds.filter(sid => sid !== id));
        } else {
            onChange([...selectedIds, id]);
        }
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">사용할 Tools</h3>
                <span className="text-xs text-muted-foreground">{selectedIds.length}개 선택</span>
            </div>
            {selectedIds.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {selectedIds.map(id => {
                        const tool = tools.find(t => t.id === id);
                        return tool ? (
                            <Badge key={id} variant="secondary">
                                {tool.icon} {tool.label}
                            </Badge>
                        ) : null;
                    })}
                </div>
            )}
            <ScrollArea className="max-h-48 rounded-md border p-2">
                <div className="flex flex-col gap-1">
                    {tools.map(tool => (
                        <label
                            key={tool.id}
                            className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted cursor-pointer"
                        >
                            <Checkbox
                                checked={selectedIds.includes(tool.id)}
                                onCheckedChange={() => handleToggle(tool.id)}
                            />
                            <span className="text-sm">
                                {tool.icon} {tool.label}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">{tool.name}</span>
                        </label>
                    ))}
                    {tools.length === 0 && (
                        <p className="text-sm text-muted-foreground py-2 text-center">등록된 Tool이 없습니다.</p>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
};
