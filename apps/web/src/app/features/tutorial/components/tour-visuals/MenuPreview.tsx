import React from 'react';

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
export const MenuPreview: React.FC = () => (
    <div className="max-h-[168px] w-44 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md">
        <MenuLabel>파일</MenuLabel>
        <MenuItem icon={<FileText size={ICON_SIZE} />} label="새 플로우" shortcut="⌘N" />
        <MenuItem icon={<Save size={ICON_SIZE} />} label="저장" shortcut="⌘S" />
        <MenuItem icon={<Download size={ICON_SIZE} />} label="JSON 내보내기" shortcut="⌘E" />
        <MenuItem icon={<ImageDown size={ICON_SIZE} />} label="PNG 내보내기" />
        <MenuSeparator />
        <MenuLabel>캔버스</MenuLabel>
        <MenuItem icon={<LayoutGrid size={ICON_SIZE} />} label="자동 정렬" shortcut="⌘A" />
        <MenuItem icon={<ChevronsDownUp size={ICON_SIZE} />} label="모두 접기" />
        <MenuItem icon={<ChevronsUpDown size={ICON_SIZE} />} label="모두 펼치기" />
        <MenuItem icon={<Trash2 size={ICON_SIZE} />} label="캔버스 초기화" destructive />
        <MenuSeparator />
        <MenuLabel>게시</MenuLabel>
        <MenuItem icon={<Globe size={ICON_SIZE} />} label="게시하기" />
        <MenuSeparator />
        <MenuLabel>설정</MenuLabel>
        <MenuItem icon={<Key size={ICON_SIZE} />} label="API 키 설정" />
        <MenuSeparator />
        <MenuItem icon={<HelpCircle size={ICON_SIZE} />} label="도움말" shortcut="?" />
        <MenuItem icon={<GraduationCap size={ICON_SIZE} />} label="튜토리얼 다시보기" />
    </div>
);
