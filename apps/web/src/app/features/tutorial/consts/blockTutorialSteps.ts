import type { TourStep } from '../types/tour';

export const BLOCK_TUTORIAL_STORAGE_KEY = 'eureka-flow-block-tutorial-completed';

export const BLOCK_TUTORIAL_STEPS: TourStep[] = [
    {
        id: 'intro',
        title: '블록 라이브러리 사용 법',
        description: '유레카플로우 사용 전,\n블록 라이브러리 사용법을 알려드릴게요!',
        arrowDirection: 'none',
        visual: { type: 'logo' },
        showSecondary: false,
    },
    {
        id: 'input-block',
        title: '입력 블록',
        description:
            '텍스트, 이미지 등 AI에게 전달할 데이터를 입력하는 블록입니다.\n입력 블록을 선택하여 캔버스에 추가하세요.',
        targetSelector: '[data-block-category="input"]',
        arrowDirection: 'left',
        visual: { type: 'icon', element: null },
    },
    {
        id: 'input-text',
        title: '입력 블록_텍스트 입력',
        description: 'AI 이미지, AI 텍스트 등 원하는 결과를 만들기 위해\n텍스트 블록에 입력을 해줍니다.',
        targetSelector: '[data-block-item="input-text"]',
        arrowDirection: 'left',
        visual: { type: 'icon', element: null },
    },
    {
        id: 'process-block',
        title: '처리 블록',
        description:
            '입력 데이터를 AI로 처리하여 결과를 생성하는 블록입니다.\n처리 블록을 선택하여 캔버스에 추가하세요.',
        targetSelector: '[data-block-category="process"]',
        arrowDirection: 'left',
        visual: { type: 'icon', element: null },
    },
    {
        id: 'process-ai-image',
        title: '처리 블록_AI 이미지',
        description: "입력 블록에서 선택한 '텍스트 입력'과 연결하여\n실행하고, AI 이미지 결과를 확인할 수 있어요",
        targetSelector: '[data-block-item="ai-image"]',
        arrowDirection: 'left',
        visual: { type: 'icon', element: null },
    },
    {
        id: 'output-block',
        title: '출력 블록',
        description: '처리된 결과를 미리보거나 로그를 확인하는 블록입니다.\n출력 블록을 선택하여 캔버스에 추가하세요.',
        targetSelector: '[data-block-category="output"]',
        arrowDirection: 'left',
        visual: { type: 'icon', element: null },
    },
    {
        id: 'output-preview',
        title: '출력 블록_미리보기',
        description: '입력 + 처리 블록을 연결한 결과를 미리볼 수 있습니다.',
        targetSelector: '[data-block-item="output-preview"]',
        arrowDirection: 'left',
        visual: { type: 'icon', element: null },
    },
    {
        id: 'help',
        title: '모르는 부분은 도움말에서 확인해 보세요.',
        description: '',
        arrowDirection: 'none',
        visual: { type: 'icon', element: null },
        primaryLabel: '완료',
        secondaryLabel: '도움말 보러가기',
    },
];
