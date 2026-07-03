# 다국어(i18n) — 서버 키 기반 번역 설계

> 2026-07 미팅 결정사항 기반 설계 문서. 구현 전 리뷰용.
>
> 관련 문서: [i18n-admin-editor-guide.md](./i18n-admin-editor-guide.md) (admin 번역 편집기 가이드)

## 1. 배경 및 목표

서버가 내려주는 텍스트(블록 이름, 설명 등)는 현재 원문 영어가 그대로 저장·노출되어 다국어 처리가 불가능하다. 이를 해결하기 위해:

- 서버는 텍스트 대신 **언어 키**를 저장·응답한다 (예: `label: "input_text"`)
- 프런트는 키를 `.json` 번역 리소스에서 찾아 값으로 변환한다
- 번역이 없으면 **키 자체를 영어 fallback 텍스트로 변환**해 노출한다 (lower/upper 케이스 처리)
- 최소 4개 이상 언어 지원
- 번역 리소스는 **레포 내 JSON 파일**(`apps/web/public/locales/`)이 유일한 소스 — presign API + S3 방식 폐기
- admin 편집기는 JSON 파일 **export/import**로 동작 (원격 저장 없음)

## 2. 현재 상태 요약

### 이미 구현된 것

| 영역              | 상태                                                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| web i18next 세팅  | 완료 — `apps/web/src/i18n/index.ts`. localStorage 캐시 → `/locales/` HTTP → 번들 fallback 3단 체인, 버전 캐시 무효화                                     |
| 언어              | `en`, `ko` (`supportedLngs` 하드코딩)                                                                                                                    |
| 네임스페이스      | `common`, `flows`, `nodes`, `landing`, `tutorial` (`apps/web/public/locales/`)                                                                           |
| admin 번역 편집기 | 완료 — `/i18n` 라우트. web `/locales/`에서 읽기, JSON 파일 export/import로 쓰기, iframe 실시간 미리보기                                                  |
| admin 언어 라벨   | 8개 언어 사전 정의 (`LANGUAGE_LABELS`: en, ko, ja, zh-TW, zh-CN, es, fr, de)                                                                             |
| admin 블록 편집   | **UI만 완료** — `/blocks` 라우트에 편집 폼은 있으나 `useBlockStore`가 `MOCK_BLOCKS` 메모리 스토어 기반. **서버 API 미연동** (저장해도 서버에 반영 안 됨) |

### 미구현 (이 문서의 범위)

서버 데이터(`GET /blocks/0/list`의 `$definition`)는 원문 텍스트로 내려와 **번역 없이 raw 렌더링**된다. 서버 키 → 번역 변환 계층이 없다.

## 3. 결정 사항

| 항목         | 결정                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 키 형식      | **snake_case** (예: `input_text`, `run_and_propagate`)                                                                                      |
| 적용 필드    | **전체** — `label`, `description`, 포트(`input$`/`output$`) label, `config$`의 label/placeholder/옵션 label                                 |
| 네임스페이스 | **신규 `blocks.json`** — UI 문자열(기존 5개 ns)과 서버 데이터 키를 분리. 별도 레포 이관·admin 편집 경계가 명확                              |
| 키 저장 위치 | 서버(블록 정의). admin `/blocks` 편집기로 기존 텍스트를 키로 교체                                                                           |
| 역할 분담    | **서버 작업(키 저장, 블록 CRUD API)은 서버 개발자 담당** — 이 문서는 블록 CRUD API가 전부 제공된다고 가정하고 프런트(web/admin) 범위만 다룸 |
| 저장 백엔드  | presign API + S3 폐기 → **레포 내 JSON 파일** + admin export/import (4.4절)                                                                 |

## 4. 설계

### 4.1 변환 규칙 (키 → fallback 텍스트)

번역이 있으면 번역 값, 없으면 키를 영어 문장으로 변환한다.

```
input_text        → 번역 있음: t('blocks:input_text')  예) "텍스트 입력"
                  → 번역 없음: humanize → "Input Text"
```

humanize 규칙 (lower/upper 처리):

1. `_` 를 공백으로 치환
2. 각 단어 첫 글자 대문자화 (Title Case)
3. 이미 텍스트인 레거시 값(공백·대문자 포함)은 키 패턴(`/^[a-z0-9_]+$/`)에 안 맞으므로 **그대로 통과** → 서버 마이그레이션 전에도 안전

엣지 케이스 주의:

- 레거시 값 중 **소문자 단일 단어**(포트 label `text`, `in` 등)는 키 패턴에 매칭되어 humanize됨 (`text` → `Text`). 표시상 케이스만 바뀌므로 실질 무해하나, 포트 label부터 키 전환을 서두르면 해소됨
- **description은 humanize fallback이 부자연스러움** (`input_text_desc` → "Input Text Desc"). 따라서 **en blocks.json에는 모든 키의 원문을 반드시 유지**하는 것을 원칙으로 함 — fallback은 en 리소스, humanize는 최후 방어선

```ts
// libs/flows/src/utils/i18n-server-key.ts (신규)
const KEY_PATTERN = /^[a-z0-9_]+$/;

export const humanizeKey = (key: string): string =>
    key
        .split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

export const translateServerKey = (t: TFunction, key: string | undefined): string => {
    if (!key) return '';
    if (!KEY_PATTERN.test(key)) return key; // 레거시 원문 텍스트는 그대로
    return i18n.exists(`blocks:${key}`) ? t(`blocks:${key}`) : humanizeKey(key);
};
```

### 4.2 blocks.json 구조

블록 타입별 중첩보다 **flat 키**를 권장 — 서버가 단일 키 문자열만 저장하므로 매핑이 단순하고, 포트/옵션 label 공유(`text`, `image` 등)가 자연스럽다.

```jsonc
// locales/{lng}/blocks.json
{
    "input_text": "텍스트 입력",
    "input_text_desc": "워크플로에 텍스트를 입력합니다",
    "output_preview": "미리보기",
    "prompt": "프롬프트",
    "model": "모델",
    "temperature": "온도",
}
```

컨벤션: 블록 label은 `{block_type}`, 설명은 `{block_type}_desc`, 포트·설정 항목은 재사용 가능한 일반 키(`prompt`, `model` 등)를 우선 사용하고 충돌 시 `{block_type}_{field}`.

### 4.3 적용 지점 (렌더 시점 변환)

변환은 **렌더 시점**에 수행한다. transform 시점(`listBlocks`)에 변환하면 언어 변경 시 refetch가 필요해지므로 피한다.

| 파일                                               | 대상                                                           |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `apps/web/.../flows/components/Sidebar.tsx`        | `block.label`, `block.description` (BlockCard, 검색 매칭 포함) |
| `apps/web/.../flows/components/NodeBlock.tsx`      | `definition.label` (customLabel 없을 때)                       |
| `apps/web/.../flows/components/DetailPanel.tsx`    | `def.label`, config 필드 label/placeholder/옵션, 포트 label    |
| `apps/web/.../flows/components/WorkflowCanvas.tsx` | 에러 메시지 내 포트 label (`missingInputs`)                    |
| `apps/web/.../mobile-editor/components/*`          | MobileBlockLibrarySheet, MobileStepCard 등 동일 필드           |

주의: `node.customLabel`(사용자 지정 이름)은 번역 대상이 아니다. `customLabel || translateServerKey(def.label)` 순서 유지.

검색(Sidebar)은 번역된 label과 키 양쪽 모두 매칭되어야 한다.

### 4.4 저장 백엔드: 레포 내 JSON 파일 + export/import

번역 소스는 **레포 파일** `apps/web/public/locales/{lng}/{ns}.json` 하나다. 원격 저장소(S3, GitHub API)는 사용하지 않는다.

```
읽기 (web):    /locales/{lng}/{ns}.json — 앱과 함께 배포되는 정적 파일
읽기 (admin):  {VITE_WEB_APP_URL}/locales/{lng}/{ns}.json — web이 서빙하는 동일 파일
쓰기 (admin):  편집 후 Export → {ns}.{lng}.json 다운로드 → 개발자가 public/locales/에 복사·커밋
Import (admin): 번역자가 수정한 {ns}.{lng}.json 업로드 → 편집기에 로드·미리보기
```

- 번역 수정 = git 커밋 → 리뷰·이력·롤백 전부 git으로 해결
- 브라우저에서 원격 쓰기가 없으므로 토큰 노출 문제 자체가 없음
- admin 편집기 코드: `apps/admin/src/app/features/i18n/consts/translation-files.ts` (fetch/export/import 파일명 파싱)

### 4.5 언어 확장 (4개 이상)

- `apps/web/src/i18n/index.ts`의 `supportedLngs: ['en', 'ko']`와 localStorage 캐시 `versions` 목록을 언어 상수로 일원화
- 후보: en, ko, **ja, zh-CN** (+ zh-TW, es, fr, de — admin `LANGUAGE_LABELS`에 이미 정의됨)
- admin은 locale 디스커버리가 동적이므로 리소스 파일만 추가하면 자동 인식

## 5. 마이그레이션 순서

1. **프런트 방어 계층 먼저** — `translateServerKey` 추가 + 렌더 지점 적용. 레거시 텍스트는 그대로 통과하므로 서버 변경 전 배포 가능
2. **blocks.json 생성** — 현 블록 목록에서 키 추출해 en(원문), ko 작성. 네임스페이스 등록 (web `namespaces`, admin `DEFAULT_NAMESPACES`)
3. **admin 블록 편집기 서버 연동** — 현 `useBlockStore`는 mock 메모리 스토어. 블록 CRUD API에 연결 (프런트 작업)
4. **서버 데이터 키 전환** — admin `/blocks` 편집기로 블록별 `label` 등을 snake_case 키로 교체 (블록 단위 점진 전환 가능)
5. **언어 추가** — ja, zh-CN 리소스 작성, `supportedLngs` 확장
6. **presign API/S3 제거** — 완료. web 로더는 `/locales/` 고정, admin 편집기는 export/import, env/워크플로우에서 `VITE_I18N_*` 변수 삭제

각 단계는 독립 배포 가능하며 롤백 부담이 없다.

## 6. 다른 프로젝트 재사용

- 번역 파일·편집기·유틸이 전부 레포 안에 self-contained (외부 인프라 의존 없음)
- 이관 시 복사 대상: `translateServerKey`/`humanizeKey` 유틸, i18next 설정 패턴, admin i18n feature 디렉터리
- 프로젝트별 조정: 네임스페이스 이름(`blocks:` 하드코딩), 렌더 지점 wrapping

## 7. 오픈 이슈

1. **키 네이밍 상세** — 포트/옵션 공용 키 범위와 충돌 규칙 (`prompt` vs `ai_prompt` 등) — blocks.json 초안 작성 시 확정
2. **flow/node 사용자 데이터** — 사용자가 만든 flow 이름·노드 customLabel은 번역 대상 아님(현행 유지). 서버 키 적용 범위는 블록 정의 등 **시스템 데이터로 한정**
3. **복수형/보간** — 현 범위(라벨 중심)에서는 불필요. 필요해지면 i18next 표준 기능 사용
