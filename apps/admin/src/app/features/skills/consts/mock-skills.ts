import type { Skill } from '../types';

export const MOCK_SKILLS: Skill[] = [
    {
        id: '0001',
        createdAt: 1770649301000,
        updatedAt: 1770649301000,
        deletedAt: 0,
        name: 'code_review',
        label: '코드 리뷰',
        icon: '👀',
        description: '코드 변경사항을 분석하고 품질, 보안, 성능 관점에서 피드백을 제공합니다.',
        prompt: `코드 변경사항을 리뷰합니다. 다음 관점에서 분석하세요:
1. 코드 품질: 가독성, 명명 규칙, 구조
2. 잠재적 버그: 엣지 케이스, 에러 처리
3. 보안: 입력 검증, 인젝션 취약점
4. 성능: 불필요한 연산, 메모리 사용
변경된 파일을 읽고 구체적인 피드백을 제공하세요.`,
        toolIds: ['0001', '0005', '0009'],
        isEnabled: true,
    },
    {
        id: '0002',
        createdAt: 1770649302000,
        updatedAt: 1770649302000,
        deletedAt: 0,
        name: 'commit',
        label: '커밋 생성',
        icon: '📦',
        description: 'Git 변경사항을 분석하고 컨벤셔널 커밋 메시지를 작성합니다.',
        prompt: `Git 변경사항을 분석하여 커밋을 생성합니다.
1. git status와 git diff로 변경사항을 확인하세요
2. 변경 내용을 요약하는 커밋 메시지를 작성하세요
3. Conventional Commits 형식을 따르세요 (feat:, fix:, refactor: 등)
4. 변경의 "왜"에 집중하세요`,
        toolIds: ['0001', '0005', '0006'],
        isEnabled: true,
    },
    {
        id: '0003',
        createdAt: 1770649303000,
        updatedAt: 1770649303000,
        deletedAt: 0,
        name: 'bug_fix',
        label: '버그 수정',
        icon: '🐛',
        description: '에러를 분석하고 원인을 파악하여 수정 코드를 작성합니다.',
        prompt: `버그를 분석하고 수정합니다.
1. 에러 메시지와 스택 트레이스를 분석하세요
2. 관련 코드를 검색하고 읽으세요
3. 근본 원인을 파악하세요
4. 최소한의 변경으로 수정하세요
5. 수정 후 테스트를 실행하여 확인하세요`,
        toolIds: ['0001', '0003', '0005', '0006'],
        isEnabled: true,
    },
    {
        id: '0004',
        createdAt: 1770649304000,
        updatedAt: 1770649304000,
        deletedAt: 0,
        name: 'documentation',
        label: '문서 작성',
        icon: '📝',
        description: '코드를 분석하여 자동으로 문서를 생성합니다.',
        prompt: `코드를 분석하여 문서를 작성합니다.
1. 대상 코드의 구조와 목적을 파악하세요
2. 공개 API, 타입, 인터페이스를 정리하세요
3. 사용 예시를 포함하세요
4. 마크다운 형식으로 작성하세요`,
        toolIds: ['0001', '0002', '0004', '0009'],
        isEnabled: true,
    },
    {
        id: '0005',
        createdAt: 1770649305000,
        updatedAt: 1770649305000,
        deletedAt: 0,
        name: 'refactor',
        label: '리팩토링',
        icon: '♻️',
        description: '코드 품질을 개선하고 구조를 리팩토링합니다.',
        prompt: `코드를 리팩토링합니다.
1. 현재 코드 구조를 분석하세요
2. 중복, 복잡도, 결합도 문제를 식별하세요
3. 동작을 변경하지 않으면서 구조를 개선하세요
4. 단계적으로 리팩토링하세요
5. 각 단계마다 테스트를 확인하세요`,
        toolIds: ['0001', '0003', '0005', '0009'],
        isEnabled: true,
    },
];
