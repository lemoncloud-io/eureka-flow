import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { ScrollText, X } from 'lucide-react';

import { useBlockLogsQuery } from '@flows/flows';
import { cn } from '@flows/lib/utils';

interface LogModalProps {
    nodeId: string;
    onClose: () => void;
}

export const LogModal: React.FC<LogModalProps> = ({ nodeId, onClose }) => {
    const { t } = useTranslation(['flows']);
    const { data: logs = [], isLoading, refetch } = useBlockLogsQuery(nodeId);
    const [filter, setFilter] = useState('');

    const filteredLogs = logs.filter(l => l.message.toLowerCase().includes(filter.toLowerCase()));

    return createPortal(
        <div
            className="fixed inset-0 z-[110] flex items-center justify-center bg-background/60 backdrop-blur-sm"
            onMouseDown={e => e.stopPropagation()}
        >
            <div className="bg-popover border border-border rounded-lg shadow-2xl w-[600px] max-w-[95vw] h-[500px] flex flex-col animate-in fade-in zoom-in-95 duration-200 font-mono">
                <div className="flex items-center justify-between p-3 border-b border-border bg-muted">
                    <div className="flex items-center gap-2">
                        <ScrollText className="w-5 h-5 text-muted-foreground" />
                        <div>
                            <h3 className="text-sm font-bold text-foreground">{t('canvas.executionLogs')}</h3>
                            <p className="text-[10px] text-muted-foreground">
                                {t('canvas.nodeId')}: {nodeId}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="p-2 border-b border-border bg-muted/50 flex gap-2">
                    <input
                        type="text"
                        placeholder={t('canvas.filterLogs')}
                        className="flex-1 bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:border-primary outline-none"
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                    />
                    <button
                        onClick={() => refetch()}
                        className="px-3 bg-muted hover:bg-accent border border-border rounded text-xs text-muted-foreground"
                    >
                        {t('canvas.refresh')}
                    </button>
                </div>
                <div
                    className="flex-1 overflow-y-auto p-2 space-y-1 bg-background/30"
                    onWheel={e => e.stopPropagation()}
                >
                    {isLoading ? (
                        <div className="flex justify-center items-center h-full text-muted-foreground text-xs">
                            {t('canvas.loading')}
                        </div>
                    ) : filteredLogs.length === 0 ? (
                        <div className="text-center text-muted-foreground text-xs py-10 italic">
                            {t('canvas.noLogs')}
                        </div>
                    ) : (
                        filteredLogs.map(log => (
                            <div
                                key={log.id}
                                className="text-[11px] flex gap-2 p-1.5 hover:bg-accent/50 rounded border-b border-border/50 last:border-0"
                            >
                                <div className="text-muted-foreground w-24 shrink-0 font-mono">
                                    {new Date(log.timestamp).toLocaleTimeString()}
                                </div>
                                <div
                                    className={cn(
                                        'w-14 shrink-0 font-bold',
                                        log.level === 'ERROR' && 'text-destructive',
                                        log.level === 'WARN' && 'text-warning',
                                        log.level !== 'ERROR' && log.level !== 'WARN' && 'text-primary'
                                    )}
                                >
                                    {log.level}
                                </div>
                                <div className="text-foreground flex-1 break-all">{log.message}</div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};
