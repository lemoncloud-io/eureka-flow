import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { MessageSquare } from 'lucide-react';

import { useItems } from '@flows/flows';
import { Badge, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@flows/ui-kit';

import type { Item, Note, Stage } from '@flows/flows';

interface UnresolvedEntry {
    note: Note;
    stage: Stage;
    item: Item;
}

const collectUnresolved = (items: Item[], maxEntries: number): { count: number; entries: UnresolvedEntry[] } => {
    let count = 0;
    const entries: UnresolvedEntry[] = [];
    for (const item of items) {
        for (const stage of item.stages) {
            for (const note of stage.notes) {
                if (!note.isResolved) {
                    count++;
                    if (entries.length < maxEntries) entries.push({ note, stage, item });
                }
            }
            for (const task of stage.tasks) {
                for (const note of task.notes) {
                    if (!note.isResolved) {
                        count++;
                        if (entries.length < maxEntries) entries.push({ note, stage, item });
                    }
                }
            }
        }
    }
    return { count, entries };
};

export const UnresolvedNotesBadge = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { data: itemsData } = useItems();
    const items = itemsData?.data ?? [];

    const { count, entries } = useMemo(() => collectUnresolved(items, 10), [items]);

    if (count === 0) return null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-8 w-8">
                    <MessageSquare className="h-4 w-4" />
                    <Badge
                        variant="destructive"
                        className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] flex items-center justify-center"
                    >
                        {count}
                    </Badge>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 max-h-80 overflow-y-auto">
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
                    {t('navigator.unresolvedNotes', 'Unresolved Notes')} ({count})
                </div>
                {entries.map(({ note, stage, item }) => (
                    <DropdownMenuItem
                        key={note.id}
                        onClick={() => navigate(`/items/${item.id}/stages/${stage.id}`)}
                        className="flex-col items-start gap-0.5 py-2"
                    >
                        <p className="text-xs truncate w-full">{note.content}</p>
                        <p className="text-[10px] text-muted-foreground truncate w-full">
                            {item.name} · {stage.name}
                        </p>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
