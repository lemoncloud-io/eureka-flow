import { LottieConfetti } from '../components/tour-visuals/LottieConfetti';
import { LottieCursorClick } from '../components/tour-visuals/LottieCursorClick';

import type { InteractiveTourStep } from '../types/tour';

export const INTERACTIVE_TUTORIAL_STORAGE_KEY = 'eureka-flow-interactive-tutorial-completed';

/** Delay for auto-transition steps (ms) */
export const AUTO_TRANSITION_DELAY_MS = 1200;

/** Delay for simulated node execution (ms) */
export const SIMULATE_EXECUTION_DELAY_MS = 3000;

/** Node positions on canvas */
export const TUTORIAL_NODE_POSITIONS = {
    textInput: { x: 200, y: 250 },
    aiImage: { x: 550, y: 250 },
    preview: { x: 900, y: 250 },
};

/** Block types used in the tutorial */
export const TUTORIAL_BLOCK_TYPES = {
    textInput: 'input-text',
    aiImage: 'single-image-generator',
    preview: 'output-preview',
};

/**
 * Interactive tutorial steps — Figma flow:
 *
 * intro → select block → (node appears) → enter text → select block →
 * (node connected) → select model → run → (generating) → select preview →
 * (all connected) → complete
 */
export const INTERACTIVE_TUTORIAL_STEPS: InteractiveTourStep[] = [
    // --- 0. Intro ---
    {
        id: 'intro',
        title: '연습으로 AI 이미지를 만들어 보시겠어요?',
        description: '유레카플로우가 처음이라면 연습을 진행해 주세요!\n이미지를 만드시려면 연습하기 버튼을 눌러주세요.',
        arrowDirection: 'none',
        visual: { type: 'logo' },
        action: 'start',
        primaryLabel: '연습하기',
        secondaryLabel: '닫기',
        showSecondary: true,
        tooltipWidth: 460,
    },

    // --- 1. Select text input block from sidebar ---
    {
        id: 'select-text-input',
        title: '텍스트 입력 노드를 선택해 주세요',
        description: '텍스트 입력 노드를 클릭하여 선택해 주세요.',
        targetSelector: '[data-block-item="0008"]',
        arrowDirection: 'left',
        action: 'confirm',
        primaryLabel: '선택',
    },

    // --- 2. (Transition) Node added to canvas ---
    {
        id: 'text-input-added',
        title: '텍스트 입력 노드가 추가되었어요!',
        description: '',
        arrowDirection: 'none',
        action: 'auto',
        autoAdvanceMs: AUTO_TRANSITION_DELAY_MS,
        showSecondary: false,
    },

    // --- 3. Enter text ---
    {
        id: 'enter-text',
        title: '텍스트 입력',
        description:
            '만들고 싶은 AI 이미지에 대한 내용을 입력해 보세요.\n예시: 강아지가 푸른 공원에서 뛰어다니는 이미지',
        arrowDirection: 'none',
        action: 'confirm',
        primaryLabel: '입력 완료',
    },

    // --- 4. Select AI image block from sidebar ---
    {
        id: 'select-ai-image',
        title: 'AI 이미지 노드를 선택해 주세요',
        description: 'AI 이미지 노드를 클릭하여 선택해 주세요.',
        targetSelector: '[data-block-item="0006"]',
        arrowDirection: 'left',
        action: 'confirm',
        primaryLabel: '선택',
    },

    // --- 5. (Transition) AI image node added + connected ---
    {
        id: 'ai-image-connected',
        title: '노드가 연결되었어요!',
        description: '',
        arrowDirection: 'none',
        action: 'auto',
        autoAdvanceMs: AUTO_TRANSITION_DELAY_MS,
        showSecondary: false,
    },

    // --- 6. Select model ---
    {
        id: 'select-model',
        title: '생성 모델 선택',
        description: '만들고 싶은 AI 생성 모델을 선택해 주세요.',
        arrowDirection: 'none',
        action: 'confirm',
        primaryLabel: '선택 완료',
    },

    // --- 7. Click run ---
    {
        id: 'run-node',
        title: '재생 버튼을 클릭해 주세요',
        description: '재생 버튼을 클릭하면 이미지가 만들어져요.\n이미지 만드는 데 대기시간이 발생할 수 있습니다.',
        arrowDirection: 'none',
        visual: { type: 'icon', element: <LottieCursorClick /> },
        action: 'confirm',
        primaryLabel: '실행',
    },

    // --- 8. (Transition) Generating ---
    {
        id: 'generating',
        title: '이미지 생성 중...',
        description: '생성이 완료될 때까지 잠시만 기다려 주세요.',
        arrowDirection: 'none',
        action: 'auto',
        autoAdvanceMs: SIMULATE_EXECUTION_DELAY_MS,
        showSecondary: false,
    },

    // --- 9. Select preview block ---
    {
        id: 'select-preview',
        title: '미리보기 노드를 선택해 주세요',
        description: '생성이 완료된 이미지를 미리볼 수 있습니다.\n미리보기 노드를 클릭하여 선택해 주세요.',
        targetSelector: '[data-block-item="0015"]',
        arrowDirection: 'left',
        action: 'confirm',
        primaryLabel: '선택',
    },

    // --- 10. (Transition) All connected ---
    {
        id: 'all-connected',
        title: '모든 노드가 연결되었어요!',
        description: '',
        arrowDirection: 'none',
        action: 'auto',
        autoAdvanceMs: AUTO_TRANSITION_DELAY_MS,
        showSecondary: false,
    },

    // --- 11. Complete ---
    {
        id: 'complete',
        title: 'AI 이미지 만들기 연습 종료!',
        description: '블록 라이브러리에서 입력, 처리, 출력 단계별로\n노드를 연결해서 원하는 결과물을 만들어 보세요.',
        arrowDirection: 'none',
        visual: { type: 'icon', element: <LottieConfetti /> },
        action: 'complete',
        primaryLabel: '확인',
        showSecondary: false,
        tooltipWidth: 460,
    },
];
