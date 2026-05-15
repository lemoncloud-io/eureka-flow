import { useTranslation } from 'react-i18next';

import { Plus } from 'lucide-react';

import { cn } from '@flows/lib/utils';

import type { FlowRole } from '@flows/flows';

interface MobileBottomBarProps {
    onAddNode: () => void;
    role?: FlowRole;
}

export const MobileBottomBar = ({ onAddNode, role = 'owner' }: MobileBottomBarProps) => {
    const { t } = useTranslation(['flows']);

    if (role !== 'owner') return null;

    return (
        <div
            className={cn(
                'fixed bottom-0 left-0 right-0 z-30',
                'pb-[env(safe-area-inset-bottom)]',
                'bg-glass-bg backdrop-blur-2xl',
                'border-t border-border/30'
            )}
        >
            <div className="px-4 py-6">
                <button
                    onClick={onAddNode}
                    className={cn(
                        'w-full h-[51px] rounded-xl',
                        'flex items-center justify-center gap-2',
                        'text-sm font-semibold',
                        'bg-card border border-primary/20 text-primary',
                        'hover:bg-primary/5 hover:border-primary/40',
                        'active:scale-[0.98] transition-all duration-200',
                        'shadow-sm'
                    )}
                >
                    <Plus className="w-4.5 h-4.5" />
                    <span>{t('mobile.addNode', '노드 추가')}</span>
                </button>
            </div>
        </div>
    );
};
