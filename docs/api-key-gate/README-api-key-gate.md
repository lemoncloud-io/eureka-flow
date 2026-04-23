# API Key Gate Injection Script

React 샘플 앱을 실행할 때 **API Key 입력 모달**을 자동으로 추가해주는 스크립트입니다.
스크립트를 실행하면 샘플 앱에 코드가 주입되고, 앱 실행 시 API Key가 없으면 모달이 뜹니다.

## Quick Start

```bash
# 1. 스크립트에 실행 권한 부여 (최초 1회)
chmod +x ./inject-api-key-gate.sh

# 2. 대상 앱에 주입
./inject-api-key-gate.sh <대상-앱-디렉토리>

# 3. 앱 실행해서 확인
cd <대상-앱-디렉토리>
npm install && npm run dev
# → http://localhost:3000 에서 API Key 모달 확인
```

## 예시

```bash
# AI Studio 단독 앱
./inject-api-key-gate.sh ai-blog-title-generator

# Monorepo 웹앱 — apps/{name}-web 디렉토리를 지정
./inject-api-key-gate.sh gemini-recipe-generator-monorepo/apps/recipe-web
./inject-api-key-gate.sh ai-ascii-art-generator-monorepo/apps/ascii-web
./inject-api-key-gate.sh gemini-code-reviewer-monorepo/apps/code-reviewer-web
./inject-api-key-gate.sh weight-tracker-monorepo/apps/weight-tracker-web

# 미리보기 (파일 변경 없이 뭐가 바뀔지만 확인)
./inject-api-key-gate.sh --dry-run ai-blog-title-generator
```

## 결과물

스크립트 실행 후 앱을 열면 이렇게 됩니다:

```
┌──────────────────────────────────────────┐
│          (앱 화면이 블러 처리됨)            │
│                                          │
│    ┌──────────────────────────┐          │
│    │  API Key Required        │          │
│    │                          │          │
│    │  Enter your Eureka Codes │          │
│    │  API key to start.       │          │
│    │                          │          │
│    │  [••••••••••••••••] 👁   │          │
│    │                          │          │
│    │  [ Continue (purple) ]   │          │
│    │                          │          │
│    │  [ Get Free Key from     │          │
│    │    Codes (링크) ]         │          │
│    └──────────────────────────┘          │
└──────────────────────────────────────────┘
```

- **API Key 입력 → Continue** 클릭 → localStorage에 저장 → 앱 정상 렌더링
- **새로고침** → 이미 저장된 키가 있으므로 모달 안 뜸
- **키 초기화** → 브라우저 DevTools > Application > Local Storage > `x-api-key` 삭제

## 스크립트가 하는 일

| Step | 파일             | 변경 내용                                                 |
| ---- | ---------------- | --------------------------------------------------------- |
| 1    | `ApiKeyGate.tsx` | 모달 컴포넌트 파일을 index.tsx 옆에 복사                  |
| 2    | `index.tsx`      | `<App />`을 `<ApiKeyGate><App /></ApiKeyGate>`로 감싸기   |
| 3    | `vite.config.ts` | 환경변수를 HTML에 주입하는 플러그인 추가 (아래 설명 참고) |
| 4    | `.env.local`     | `VITE_CODES_URL` 환경변수 추가                            |

> 여러 번 실행해도 안전합니다. 이미 주입된 파일은 자동으로 SKIP합니다.

## 파일 구조

```
├── inject-api-key-gate.sh        # 이 스크립트
├── README-api-key-gate.md        # 이 문서
└── templates/
    └── ApiKeyGate.tsx             # 주입될 React 컴포넌트
                                   # (순수 React만 사용, 외부 라이브러리 없음)
```

## 환경변수 동작 원리

`.env.local` 파일의 `VITE_` 로 시작하는 환경변수는 빌드 시 HTML에 자동 주입됩니다.

```
.env.local                    빌드 시 HTML에 주입         React 코드에서 사용
───────────────────     →     ──────────────────     →    ─────────────────
VITE_CODES_URL=https://...    window.CODES_URL="..."      window.CODES_URL
```

| 환경변수         | 용도                                      | 기본값                         |
| ---------------- | ----------------------------------------- | ------------------------------ |
| `VITE_CODES_URL` | "Get Free Key from Codes" 버튼의 링크 URL | `https://console.eureka.codes` |

> 기본값이 있어서 `.env.local`이 없어도 동작합니다.

## 저장되는 데이터

사용자가 입력한 API Key는 브라우저의 localStorage에 저장됩니다.

```
키 이름: x-api-key
저장소:  localStorage
```

다른 코드에서 이 키를 사용하려면:

```ts
// 키 읽기
const apiKey = localStorage.getItem('x-api-key');

// API 호출 시 헤더에 포함
fetch(url, {
    headers: { 'x-api-key': localStorage.getItem('x-api-key') ?? '' },
});
```

## 트러블슈팅

**모달이 안 뜨는 경우**

- 브라우저 DevTools > Application > Local Storage에서 `x-api-key` 항목이 이미 있는지 확인
- 있으면 삭제 후 새로고침

**"Get Free Key from Codes" 링크가 안 보이는 경우**

- 기본값(`https://console.eureka.codes`)이 적용되므로 항상 보여야 함
- 안 보이면 `ApiKeyGate.tsx`가 최신 버전인지 확인 (파일 삭제 후 스크립트 재실행)

**vite.config.ts 패치 실패 (WARN 메시지)**

- `defineConfig`가 함수 형태인지 확인:

    ```ts
    // OK
    export default defineConfig(({ mode }) => {
      const env = loadEnv(mode, process.cwd(), '');
      return { ... };
    });

    // NG — 이 형태면 수동으로 위 형태로 바꿔주세요
    export default defineConfig({ ... });
    ```

## 주의사항

- macOS / Linux 모두 지원 (OS 자동 감지)
- Monorepo 샘플은 이미 환경변수 플러그인이 있어서 Step 3이 자동 SKIP됨
- `index.tsx`가 루트에 있으면 flat 구조, `src/`에 있으면 src 구조로 자동 감지
