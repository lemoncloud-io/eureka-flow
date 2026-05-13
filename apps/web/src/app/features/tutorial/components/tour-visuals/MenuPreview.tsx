import React from 'react';
import { useTranslation } from 'react-i18next';

import {
    ChevronsDownUp,
    ChevronsUpDown,
    Download,
    FileText,
    Globe,
    GraduationCap,
    HelpCircle,
    ImageDown,
    Key,
    LayoutGrid,
    Save,
    Trash2,
} from 'lucide-react';

interface MenuItemProps {
    icon: React.ReactNode;
    label: string;
    shortcut?: string;
    destructive?: boolean;
}

const MenuItem: React.FC<MenuItemProps> = ({ icon, label, shortcut, destructive }) => (
    <div className="flex items-center gap-1.5 rounded-sm px-2 py-1 text-[11px]">
        <span className={destructive ? 'text-destructive' : 'text-muted-foreground'}>{icon}</span>
        <span className={destructive ? 'text-destructive' : 'text-foreground'}>{label}</span>
        {shortcut && <span className="ml-auto text-[9px] text-muted-foreground">{shortcut}</span>}
    </div>
);

const MenuLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="px-2 py-0.5 text-[9px] text-muted-foreground">{children}</div>
);

const MenuSeparator = () => <div className="my-0.5 h-px bg-border" />;

const ICON_SIZE = 12;

/** Static preview of the main menu for the guide tour */
export const MenuPreview: React.FC = () => {
    const { t } = useTranslation('tutorial');

    return (
        <div className="max-h-[168px] w-44 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md">
            <MenuLabel>{t('menuPreview.file')}</MenuLabel>
            <MenuItem icon={<FileText size={ICON_SIZE} />} label={t('menuPreview.newFlow')} shortcut="⌘N" />
            <MenuItem icon={<Save size={ICON_SIZE} />} label={t('menuPreview.save')} shortcut="⌘S" />
            <MenuItem icon={<Download size={ICON_SIZE} />} label={t('menuPreview.exportJson')} shortcut="⌘E" />
            <MenuItem icon={<ImageDown size={ICON_SIZE} />} label={t('menuPreview.exportPng')} />
            <MenuSeparator />
            <MenuLabel>{t('menuPreview.canvas')}</MenuLabel>
            <MenuItem icon={<LayoutGrid size={ICON_SIZE} />} label={t('menuPreview.autoLayout')} shortcut="⌘A" />
            <MenuItem icon={<ChevronsDownUp size={ICON_SIZE} />} label={t('menuPreview.collapseAll')} />
            <MenuItem icon={<ChevronsUpDown size={ICON_SIZE} />} label={t('menuPreview.expandAll')} />
            <MenuItem icon={<Trash2 size={ICON_SIZE} />} label={t('menuPreview.clearCanvas')} destructive />
            <MenuSeparator />
            <MenuLabel>{t('menuPreview.publish')}</MenuLabel>
            <MenuItem icon={<Globe size={ICON_SIZE} />} label={t('menuPreview.publishAction')} />
            <MenuSeparator />
            <MenuLabel>{t('menuPreview.settings')}</MenuLabel>
            <MenuItem icon={<Key size={ICON_SIZE} />} label={t('menuPreview.apiKeySettings')} />
            <MenuSeparator />
            <MenuItem icon={<HelpCircle size={ICON_SIZE} />} label={t('menuPreview.help')} shortcut="?" />
            <MenuItem icon={<GraduationCap size={ICON_SIZE} />} label={t('menuPreview.replayTutorial')} />
        </div>
    );
};
