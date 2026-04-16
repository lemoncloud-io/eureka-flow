import React from 'react';

import { FileText, LayoutGrid } from 'lucide-react';

import { MenuPreview } from '../components/tour-visuals/MenuPreview';
import { ShortcutGrid } from '../components/tour-visuals/ShortcutGrid';
import { TourStepIcon } from '../components/tour-visuals/TourStepIcon';

import type { TourStep } from '../types/tour';

export const GUIDE_TOUR_STORAGE_KEY = 'eureka-flow-guide-tour-completed';

export const GUIDE_TOUR_STEPS: TourStep[] = [
    {
        id: 'welcome',
        title: '에디터를 둘러볼까요!?',
        description:
            'EurekaAPI 키가 설정되었습니다.\n워크플로우 에디터를 빠르게 둘러볼게요!\n튜토리얼은 메뉴에서 언제든 다시 볼 수 있습니다.',
        arrowDirection: 'none',
        visual: { type: 'logo' },
        showSecondary: false,
    },
    {
        id: 'block-library',
        title: '블록 라이브러리',
        description:
            '블록 메뉴 아이콘을 클릭하면 블록 라이브러리 메뉴가 열려요!\n입력, 처리, 출력 블록을 찾아보고 드래그하거나 클릭하여\n캔버스에 추가하세요.',
        targetSelector: '[data-tour="sidebar"]',
        arrowDirection: 'left',
        visual: { type: 'icon', element: <TourStepIcon icon={<LayoutGrid size={28} />} label="블록 라이브러리" /> },
    },
    {
        id: 'flow-info',
        title: '플로우 정보 및 상태',
        description:
            '플로우 이름, 저장 상태, 연결 상태를 확인할 수 있어요.\n이름을 클릭하면 워크플로우 이름을 변경할 수 있습니다.',
        targetSelector: '[data-tour="header-left"]',
        arrowDirection: 'top',
        visual: { type: 'icon', element: <TourStepIcon icon={<FileText size={28} />} label="플로우 정보" /> },
    },
    {
        id: 'quick-actions',
        title: '빠른 작업',
        description:
            '저장, 실행 취소, 다시 실행, 플로우 목록 열기를 할 수 있어요\n키보드 단축키로도 빠르게 사용할 수 있습니다.',
        targetSelector: '[data-tour="header-toolbar"]',
        arrowDirection: 'top',
        visual: { type: 'icon', element: <ShortcutGrid /> },
    },
    {
        id: 'main-menu',
        title: '메인 메뉴',
        description:
            '파일 작업(내보내기, 가져오기), 편집 도구(자동 정렬, 초기화),\n게시, 도움말 등 메인 메뉴에서 사용할 수 있어요\nAPI 키 설정에서 EurekaAPI 키를 관리합니다.',
        targetSelector: '[data-tour="header-menu"]',
        arrowDirection: 'top',
        visual: { type: 'icon', element: <MenuPreview /> },
    },
    {
        id: 'ready',
        title: '준비 완료!',
        description:
            '블록 라이브러리에서 블록을 추가하고 연결하는 것 부터 시작하세요!\n언제든 메인 메뉴에서 도움말을 클릭하여 유레카플로우 안내를 받을 수 있습니다.',
        arrowDirection: 'none',
        visual: { type: 'confetti' },
        primaryLabel: '시작하기',
    },
];
