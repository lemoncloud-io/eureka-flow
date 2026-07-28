# 그래프는 어디에 있나

`docs/flow-engine` 브랜치 기준. 한 장짜리 지도.

> **먼저**: 저장 위치는 **안 바뀌었다.** 서버 엔드포인트도, localStorage 키도, IndexedDB 도
> 그대로다. 바뀐 건 **메모리에서 누가 그래프를 소유하느냐**와 **로드 응답을 누가 정규화하느냐** 다.

---

## 계층

| 층                | 무엇                                                              | 어디                                                                                           | 무엇을 견디나     |
| ----------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------- |
| **엔진 document** | **소스 오브 트루스.** 편집·undo/redo·클립보드가 여기서만 일어난다 | `libs/engine/src/core/document.ts` (`createFlowEngine`)                                        | 아무것도 — 메모리 |
| `useCanvasStore`  | **단방향 투영.** 컴포넌트 수십 개가 여기서 읽는다                 | `libs/flows/src/stores/useCanvasStore.ts`                                                      | 아무것도 — 메모리 |
| `baseline`        | 서버가 **마지막으로 확인한** 그래프. dirty 판정의 기준선          | `useFlowsStore.baseline` (`FlowSnapshot`)                                                      | 아무것도 — 메모리 |
| 드래프트          | 저장 안 된 작업물                                                 | **IndexedDB** `eureka-flow` / `drafts` / key `'current'`                                       | 새로고침·탭 종료  |
| 세션 조각         | 열려 있던 flowId, 자동저장 on/off, 플로우별 뷰포트                | **localStorage** (`flows-current-flow-id`, `flows-auto-save-enabled`, `eureka-flow:viewports`) | 새로고침          |
| 서버              | 정본                                                              | `POST /flows/:id/save` · `GET /flows/:id/load`                                                 | 전부              |

### 규칙 하나

> **엔진에 쓰고, 스토어에서 읽는다.**

`useEngineMirror` (`apps/web/.../hooks/useEngineMirror.ts`) 가 `engine.subscribe` → `useCanvasStore.setState`
한 방향으로만 민다. 스토어를 읽어 엔진에 되쓰는 코드는 없다 — 그래서 둘이 서로 다르다고 다툴 수가 없다.

드래그 중에는 미러가 **멈춘다**(`paused`). 스토어가 커밋 안 된 프리뷰 좌표를 들고 엔진보다 앞서
있는 구간이라, 실행 중 소켓 메시지 하나가 노드를 커서 밑으로 되돌리는 걸 막는다.

### 엔진 인스턴스는 몇 개인가

에디터에는 **하나**다. `FlowEditorPage.tsx:81` 이 만들고 `:760` 에서 `engine={engine}` 로 캔버스에 넘긴다.
`WorkflowCanvas.tsx:261` 의 `engineProp ?? fallbackEngine` 은 캔버스가 **단독으로 렌더될 때**
(컴포넌트 뷰어 모달) 쓰는 폴백이지, 두 번째 에디터 엔진이 아니다.

---

## 경로

```
GET /flows/:id/load
  └─ engine.loadGraph(state, { ports })      ← 유일한 입구
       normalize: id 민팅 · config/position 채움 · 중복 엣지 제거
                  · 레거시 `connections` 필드 · 포트 값 병합 · 엣지 전파
  └─ setBaseline(...)                        ← dirty 의 기준

편집 (engine.transact)
  └─ history push → 미러 → useCanvasStore → 화면
  └─ (debounce) draftFor(graph) → IndexedDB      ← 저장 안 눌러도 살아남는 곳

POST /flows/:id/save
  body = toSnapshot(graph, blockRegistry)    ← **그래프 전체. patch 아니라 교체**
  └─ rebaseline(saveBody)
  └─ clearDraft()                            ← 서버가 가졌으니 로컬 사본 불필요
                                                (structureDropped 면 유지 — 그 작업은 아직 여기밖에 없다)
```

`loadGraph` 가 **단일 입구**인 게 이 브랜치의 핵심 변경 중 하나다. 전에는 캔버스가
`loadGraph` 를 부르기 **전에** 포트 병합·엣지 전파를 따로 했고, `repository`(헤드리스)는
그 두 패스를 못 받아서 같은 응답으로 다른 그래프를 만들었다.

### 저장되지 **않는** 것

실행 중 생기는 노드 state·포트 데이터는 `engine.applyRuntime` 으로 들어가고,
**history 에 안 쌓이며 `toSnapshot` 이 버린다.** 실행은 편집이 아니다 — 노드를 돌려도
undo 스택은 그대로고 다음 save 가 보낼 것도 안 생긴다.

포트 값 자체는 서버의 포트 레코드(`upsertPortNode`)에 따로 올라간다. 백엔드 노드가 읽는 게 그것.

---

## 들여다보기

| 하고 싶은 것          | 방법                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| 지금 캔버스가 든 JSON | 화면의 **GRAPH** 패널 (`DevGraphPanel`) — `flow / nodes / edges / baseline` 표시, Export/Import            |
| 브라우저 없이 전 구간 | `yarn engine:demo` — `load → add → undo → redo → save → run`                                               |
| 실서버에 붙여보기     | `FLOW_API_URL=… FLOW_API_KEY=… yarn engine:demo --real --flow <id>` (**기본 read-only**, 쓰려면 `--write`) |

---

## 주의: `CLAUDE.md` 가 낡았다

`CLAUDE.md` 의 State Architecture 가 `useCanvasStore` 를 "Canvas UI state: nodes, connections…" 라고,
Data Flow Architecture 가 `WorkflowCanvas └── useCanvasStore (nodes, connections, viewport)` 라고 적고 있다.
지금은 **스토어가 투영이고 그래프는 엔진 소유**다. 이 브랜치에서 고치지 않았다 — 별도 판단.

같은 파일의 "Channel ID from `GET /flows/:id/load` response" 도 부정확하다(서버가 그 필드를 보내지 않는다).
관련 클라이언트 배선은 이 브랜치에서 제거했고, 실행 프레임은 채널이 아니라 connectionId 로 전달된다.

더 깊게: `docs/engine/PLAN.md` — Phase 0~6, 불변식, 결함 재현, 정정 이력.
