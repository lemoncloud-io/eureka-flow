# 다국어(i18n) — 서버 언어키(`*En`) 기반 번역 설계

> 관련 문서: [i18n-admin-editor-guide.md](./i18n-admin-editor-guide.md) (admin 번역 편집기 가이드)

## 1. 배경 및 목표

서버가 내려주는 텍스트(블록 이름, 설명, 포트·설정 라벨)는 원문 하나만 저장되어 다국어 처리가 불가능했다. 이를 해결하기 위해:

- 서버는 **원문을 유지한 채 언어키를 형제 필드에 추가**한다 (`label` + `labelEn: "input_text"`)
- 프런트는 `labelEn`의 키로 번역을 찾고, 없으면 **원문 `label`을 그대로 노출**한다
- 번역 리소스는 **레포 내 JSON 파일**(`apps/web/public/locales/`)이 유일한 소스
- admin 편집기는 JSON 파일 **export/import**로 동작 (원격 저장 없음)

## 2. 핵심 규칙

**텍스트 필드 `X`의 언어키는 형제 필드 `XEn`에 있다.**

```
label       ↔ labelEn
description ↔ descriptionEn
port.label  ↔ port.labelEn
config.label / config.placeholder ↔ config.labelEn / config.placeholderEn
```

이 규칙은 `libs/flows/src/utils/i18nServerKey.ts`의 `EN_SUFFIX` 상수 한 곳에만 존재한다. 호출부 46곳은 접미사를 모른다 — 필드명이 바뀌어도 수정은 1줄.

## 3. 변환 규칙

```ts
translateField(t, block, 'label');
//  1. block.labelEn 있으면 → t('blocks:<key>') 번역값
//  2. 번역 없거나 labelEn 없으면 → block.label 원문
//  3. 둘 다 없으면 → ''
```

- **추측하지 않는다.** 원문이 우연히 snake_case여도 `labelEn`이 없으면 그대로 원문 취급
- **부분 마이그레이션 안전.** 서버가 일부 필드에만 키를 붙여도 나머지는 원문으로 정상 렌더 → 프런트 코드 변경 불필요
- 검색(`blockMatchesQuery`)은 번역값·원문·언어키·type을 모두 매칭

> **이전 설계와의 차이** — 예전에는 `label` 자체를 키로 덮어쓰고 `/^[a-z0-9_]+$/` 정규식으로 "키인지 원문인지" 추측했다. 원문이 파괴되고 fallback이 `humanizeKey('input_text') → "Input Text"` 같은 기계 문장이 되는 문제가 있어 `*En` 방식으로 대체했다. 일괄 변환 도구(`useBlockMigration`)도 함께 제거됐다 — `*En`은 가산적이라 대량 변환이 필요 없다.

## 4. blocks.json 구조

블록 타입별 중첩보다 **flat 키**를 쓴다. 서버가 단일 키 문자열만 저장하므로 매핑이 단순하고, 포트·옵션 라벨 공유(`text`, `image` 등)가 자연스럽다.

```jsonc
// apps/web/public/locales/{lng}/blocks.json
{
    "input_text": "텍스트 입력",
    "input_text_desc": "워크플로에 텍스트를 입력합니다",
    "prompt": "프롬프트",
    "model": "모델",
}
```

컨벤션: 블록 라벨은 `{block_type}`, 설명은 `{block_type}_desc`, 포트·설정 항목은 재사용 가능한 일반 키(`prompt`, `model`)를 우선 쓰고 충돌 시 `{block_type}_{field}`.

## 5. 데이터 경로 (⚠️ 서버 확인 필요)

텍스트가 두 군데에 저장된다:

```
admin  ──읽기/쓰기──>  최상위 name, label, description, input$$, output$$, config$$
web    ──읽기────────>  $definition { label, description, inputs[], outputs[], configSchema[] }
```

`libs/flows/src/api/blocks.ts`가 `...item.$definition`을 스프레드해 레지스트리를 만들므로 **web은 최상위 필드를 보지 못한다.** 따라서 `*En`은 전 구간을 통과해야 한다:

```
admin이 최상위 *En 저장 → 서버가 $definition에 접어넣음 → web이 $definition.*En 읽음
```

**서버팀 확정 필요:**

- (a) `$definition` 안에 `*En`이 채워질 것
- (b) admin이 쓴 최상위 `*En`이 저장 시 `$definition`으로 전파될 것 (지금 `label`이 가는 경로와 동일)

(a) 미충족 시 web 번역이 동작하지 않는다. 단 fallback 설계라 **앱은 원문으로 정상 동작**한다(회귀 없음).

## 6. 적용 지점

변환은 **렌더 시점**에 수행한다. transform 시점(`listBlocks`)에 변환하면 언어 변경 시 refetch가 필요해진다.

| 영역     | 파일                                                                                                                                                                              |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 공용     | `libs/flows/src/utils/i18nServerKey.ts` (`translateField`, `fieldKey`), `blockUtils.ts` (`resolveNodeName`, `blockMatchesQuery`)                                                  |
| 데스크톱 | `flows/components/` Sidebar, NodeBlock, DetailPanel, PortItem, CanvasContextMenu, WorkflowCanvas, ModelSelect, help/BlockReferenceContent · `flows/hooks/useSocketHandlers`       |
| 모바일   | `mobile-editor/` MobileStepDetail, ConfigFieldList, MobileConnectionCard/Sheet, MobileStepList, MobileBlockLibrarySheet, MobileStepCard, useConnectionMode, utils/nodeDisplayName |

주의: `node.customLabel`(사용자 지정 이름)은 **번역 대상이 아니다.** `customLabel || translateField(t, def, 'label')` 순서를 유지한다.

## 7. 번역 리소스 관리

```
읽기 (web):     /locales/{lng}/{ns}.json — 앱과 함께 배포되는 정적 파일
읽기 (admin):   {VITE_WEB_APP_URL}/locales/{lng}/{ns}.json
쓰기 (admin):   편집 후 Export → {ns}.{lng}.json 다운로드 → 개발자가 public/locales/에 복사·커밋
Import (admin): 번역자가 수정한 {ns}.{lng}.json 업로드 → 편집기에 로드·미리보기
```

번역 수정 = git 커밋이므로 리뷰·이력·롤백이 전부 git으로 해결된다. 브라우저에서 원격 쓰기가 없어 토큰 노출 문제도 없다.

## 8. 남은 작업

1. **서버** — `*En` 필드 추가 + `$definition` 전파 (5절 (a)(b))
2. **admin 타입·매퍼** — `BlockView`/`BlockBody`와 양방향 매퍼에 `*En` 추가. **누락 시 admin에서 블록을 저장할 때 언어키가 유실된다**
3. **admin 편집 UI** — 각 텍스트 입력 옆 키 입력칸 (+ `blocks.json` 자동완성·번역 미리보기)
4. **운영** — admin에서 블록별로 키 입력
5. **언어 확장** — `ja`, `zh-CN` 리소스 추가 + `supportedLngs` 확장

## 9. 다른 프로젝트 재사용

번역 파일·편집기·유틸이 전부 레포 안에 self-contained다(외부 인프라 의존 없음). 이관 시 복사 대상: `translateField`/`fieldKey`, i18next 설정 패턴, admin i18n feature 디렉터리. 프로젝트별 조정은 네임스페이스 이름(`blocks:` 하드코딩)과 렌더 지점 wrapping 정도.
