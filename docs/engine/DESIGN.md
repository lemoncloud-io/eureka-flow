# Flow Engine — 설계 문서 (2026-07, 착수 전)

> **이 문서는 착수 전에 쓴 설계 근거다. 현재 상태를 알고 싶으면 [GUIDE.md](./GUIDE.md) 를 봐라.**
> 여기 남겨두는 이유는 _왜 그렇게 하기로 했는지_ 가 결과물에는 안 남기 때문이다.
> 구현하면서 몇 가지는 다르게 갔고, 아래 "무엇이 달라졌나" 에 적었다.

> 목표: flow graph(디자인 = 블럭 + 노드 + 엣지)가 **인메모리에서 돌아가는 헤드리스 엔진**(`@flows/engine`).
> 브라우저/Node.js/셸 어디서든 동일하게 실행되고, React 캔버스와 에이전트(`libs/agent`)는
> 이 엔진의 구독자/조작자가 된다.
>
> 실행 기록은 [PLAN.md](./PLAN.md) — Phase 별 완료 조건과 정정 이력이 거기 있다.

## 무엇이 달라졌나

착수 전 판단과 실제 구현이 갈린 지점 넷. 아래 본문은 **고치지 않았다** — 당시 판단 그대로다.

| 이 문서가 말한 것                                                         | 실제                                                                                                                       | 근거                                          |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 포트 **5개** (Http·Storage·Llm·Socket·Auth)                               | **3개** — Storage·Llm 은 만들지 않았다                                                                                     | PLAN §13                                      |
| `CanvasBinding` 을 엔진 위에 **재구현**하고 툴 확장(`addNode`/`connect`…) | **무변경.** 인터페이스도 구현체도 그대로 — `WorkflowCanvasRef.updateNode` 안쪽만 엔진으로 바뀌어서 바인딩이 손댈 게 없었다 | `docs/browser-agent/design/canvas-binding.md` |
| 에이전트는 **다른 레포**(`eureka-flow-agents` 포크)에 있다                | PR #120 으로 **이 레포** `libs/agent` 에 들어왔다                                                                          | —                                             |
| Phase **0–3**                                                             | 실제 **0–6** + npm 배포(§14) + 모바일 전환(§15)                                                                            | PLAN 목차                                     |

`useFlows` → `repository` 이관도 "한다" 로 적혀 있었지만 하지 않기로 뒤집었다 — 근거는 PLAN §12.

---

## 1. 현재 코드 분석

### 1.1 eureka-flow — 그래프가 어디에 사는가

그래프 데이터 모델 자체는 이미 깔끔하다. `NodeData` / `EdgeData` / `WorkflowState`는 서버 패키지(`@lemoncloud/eureka-flows-api`)에서 오고, 블록 정의는 `BlockDefinitionWithFrontend`(isFrontend / stereo / execute)로 확장돼 있다. 문제는 데이터가 아니라 **로직의 위치**다.

| 관심사                             | 현재 위치                                                                       | 헤드리스(비-React) 재사용                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 그래프 상태 (nodes + connections)  | `useCanvasStore` (zustand) — UI 상태(viewport, selection, tooltip, drag)와 혼재 | △ `createCanvasStore()` vanilla 팩토리가 이미 존재                                          |
| 노드/엣지 추가·삭제·연결 편집      | `WorkflowCanvas.tsx` (121KB 컴포넌트) 내부 콜백들                               | ✗                                                                                           |
| undo/redo 히스토리                 | `WorkflowCanvas.tsx`의 `pastRef`/`futureRef` (React ref) + JSON 딥카피 스냅샷   | ✗                                                                                           |
| 복사/붙여넣기                      | `WorkflowCanvas.tsx` 로컬 state (`useState<NodeData[]>`), 키보드 이벤트 핸들러  | ✗                                                                                           |
| 더티 판정 / 저장 스냅샷 / baseline | `libs/flows/src/workspace/*` (snapshot·diff·baseline·draft) — 거의 순수함수     | ◎ (단, `useFlowsStore.getState()` 싱글톤 결합)                                              |
| 로딩/저장 API                      | `loadFlow`/`saveFlow` 순수 함수 + `useFlows` 훅(TanStack Query)                 | △ API 함수는 분리돼 있으나 axios 클라이언트(web-core)가 localStorage 인증(x-api-key)에 결합 |
| 실행 반영 (socket)                 | `useInitFlowSocket` — React 훅 + 브라우저 Worker 기반 WebSocket                 | ✗                                                                                           |
| 프론트 블록 실행                   | `EXECUTE_FUNCTIONS` — 일부 DOM 의존 (`image-info`의 `new Image()`)              | △                                                                                           |

핵심 관찰:

**(a) 진실의 원천이 3군데로 분산돼 있다.** 그래프 자체는 `useCanvasStore`, 히스토리·클립보드는 `WorkflowCanvas` 컴포넌트 로컬, 저장 기준선(baseline)은 `useFlowsStore`. "디자인을 인메모리에서 관리"하는 단일 주체가 없고, 캔버스 컴포넌트가 사실상의 엔진 노릇을 하고 있다.

**(b) undo/redo는 이식 불가능한 형태다.** `saveCheckpoint()`가 전체 그래프를 `JSON.parse(JSON.stringify())` 딥카피해서 React ref에 쌓는다. 권한 게이트(`canModifyCanvas`)까지 이 안에 박혀 있다. 헤드리스 환경에는 이 히스토리가 아예 존재하지 않는다.

**(c) 복사/붙여넣기는 반쪽 구현이다.** 현재는 **노드만** 복사한다. 선택된 노드들을 재-ID(`newNodeId()`) + 40px 오프셋 + 런타임 상태 리셋으로 복제하지만, **선택 집합 내부의 엣지는 복사되지 않는다**. 서브그래프 복사(내부 엣지 포함, ID 매핑 테이블로 재연결)는 엔진 코어에서 구현하면 자연스럽게 해결된다. 기술적 장애물은 없다.

**(d) workspace 레이어는 그대로 엔진의 씨앗이다.** `toSnapshot`(런타임 필드 제거) → `diffSnapshots`(canonical stringify 기반) → `rebaseline`(전송된 스냅샷 기준, non-owner 구조 드랍 감지) 흐름은 설계 품질이 높고 거의 순수함수라 엔진으로 이식 비용이 낮다. 유일한 결합은 `useFlowsStore.getState()` 직접 호출.

**(e) ID는 클라이언트가 canonical이다.** `graphId.ts` — 서버 save가 ID 기준 upsert이므로 클라이언트 생성 ID가 그대로 최종 ID다. 단 charset 제약이 서버에서 load-bearing(`:` 포트 참조, `@` 런 참조, `-` DynamoDB 키 rewrite 충돌, 선행 `#` 삭제 마커)이므로 엔진이 이 규칙을 그대로 소유해야 한다.

**(f) 저장은 전체-교체 시맨틱이다.** save body에서 빠진 노드/엣지는 삭제로 처리된다. 엔진의 save는 반드시 "전체 스냅샷 전송"이어야 하고, 부분 패치를 흉내내면 안 된다.

### 1.2 eureka-flow-agents 포크 — 무엇이 있고 무엇이 없는가

포크의 `libs/agent`(@flows/agent)는 포트/어댑터 스타일이 일관되고 테스트도 충실하다:

- **LlmGateway** — 유일한 LLM 출구. Gemini/OpenAI/fake 구현, 스트리밍 + tool call 청크, capabilities 선언
- **HttpRequestSupportable** — fetch 기반 HTTP 포트 (테스트용 scripted 구현 포함)
- **AgentEnvironment** — 런타임 경계: storage(localStorage/memory), trace, clock, abort. 금지 capability를 `false` 리터럴 타입으로 컴파일 타임에 봉인
- **ToolExecutor** — 툴 콜 단일 관문: 라우팅 → 스키마 검증 → grant 체크 → 디스패치. `FlowPermissions`의 컴파일 가드된 부분집합(`Capability`)으로 권한 연동
- **BaseAgent** — think/act 루프, 세션 영속화, abort

그러나 "블랙박스 모델" 요구사항 기준의 구조적 한계:

1. **그래프를 소유하지 않는다.** `CanvasBinding`은 `readGraph()` + `updateNode(id, {label, position})` 딱 두 개다. 진실의 원천은 여전히 React가 소유한 라이브 캔버스(`useCanvasStore` + `WorkflowCanvasRef`)이고, 에이전트는 그걸 원격 조작할 뿐이다. 지금의 "블랙박스"는 엔진이 아니라 **브라우저 캔버스에 기생하는 조작기**이며, 브라우저에서만 돌아가는 근본 이유가 이것이다.
2. **구조 편집이 불가능하다.** 툴이 `list_nodes`, `move_node` 둘뿐 — 노드 추가/삭제, 엣지 연결/해제가 계약(`CanvasBinding`)에 없다.
3. **헤드리스에는 히스토리가 없다.** 데스크톱 바인딩은 `WorkflowCanvasRef.updateNode`가 `saveCheckpoint()`를 불러 undo가 되지만, `createInMemoryCanvasBinding`에는 체크포인트 개념 자체가 없다. undo가 UI 레이어의 부수효과인 구조.
4. **`node-virtual`은 테스트용 가상 런타임이다.** 진짜 Node/셸 프로덕션 경로가 아니다 — 세션 영속화는 localStorage(useAgentSession), LLM 키는 브라우저에서 직접, 백엔드 프록시 게이트웨이는 deferred. 서버 로딩/저장 연동도 없다.

정리: 포크는 **에이전트 런타임(생각/행동 루프 + 포트들)** 은 잘 깔았는데, 그 에이전트가 딛고 설 **그래프 엔진이 없어서** 브라우저 캔버스를 그래프 대용으로 쓰고 있는 상태다. 포트들(Http/Storage/Llm/Environment/ToolExecutor)은 버리지 않고 엔진의 포트 계층으로 승격한다.

---

## 2. 요구사항 → 갭

| #   | 요구사항                                            | 현재 상태                                                                                             | 갭                                                           |
| --- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | **로딩** — 서버에서 block + 디자인 읽기             | `getBlocks`/`loadFlow` API 함수 존재, 단 axios+localStorage 인증에 결합, React Query 훅으로만 소비    | Http/Auth 포트 뒤로 옮기면 재사용 가능. 낮음                 |
| 2a  | **편집** — 노드/엣지 추가·삭제·수정                 | 로직 전부 `WorkflowCanvas.tsx` 안                                                                     | 엔진 코어로 이동 필요. **가장 큰 작업**                      |
| 2b  | **히스토리** (undo/redo)                            | React ref + 딥카피, UI에 갇힘                                                                         | 엔진의 commit 단위 히스토리로 재설계                         |
| 2c  | **복사/붙여넣기**                                   | 노드만, 엣지 미포함, UI 이벤트 핸들러에 인라인                                                        | 서브그래프 복사로 엔진에서 구현 — 가능, 장애물 없음          |
| 3   | **뷰어** — 변경마다 라이브 표시                     | zustand 구독으로 이미 리액티브                                                                        | 엔진이 subscribe/이벤트만 내면 React 바인딩은 얇아짐. 낮음   |
| 4   | **저장** — 서버에 저장                              | `saveFlow` + workspace(snapshot/diff/baseline/rebaseline) 품질 좋음                                   | 싱글톤 결합 제거 후 엔진 이식. 낮음                          |
| 5   | **블랙박스 이식성** — 브라우저/node/셸              | agents 포크의 environment/http/storage 포트가 골격 절반                                               | 그래프 소유권 + Socket 포트 + Auth 포트 + AI Gen 어댑터 필요 |
| 6   | **어댑터 패턴** — AI Gen, fetch(http/local), socket | LlmGateway ◎, HttpPort ◎, Socket ✗ (브라우저 Worker 훅), AI Gen은 백엔드 runNode 경유가 사실상의 경로 | SocketPort 신설이 핵심 신규 작업                             |

---

## 3. 아키텍처

### 3.1 원칙

**그래프 진실의 원천을 엔진으로 옮긴다.** React 캔버스는 엔진의 구독자(뷰)가 되고, 에이전트의 `CanvasBinding`은 엔진 위에 재구현한다. 이 한 가지 결정이 모든 요구사항을 관통한다 — 같은 엔진 인스턴스가 브라우저에서는 캔버스 뒤에, Node에서는 단독으로 돈다.

```
                ┌──────────────────────────────────────────┐
                │              FlowEngine (pure TS)        │
                │  Document(nodes/edges/blocks)            │
                │  GraphOps  History  Clipboard  Events    │
                │  Repository(load/save, baseline/diff)    │
                └───────┬───────────────┬──────────────────┘
     ports:         HttpPort  AuthPort  SocketPort  StoragePort  Clock
                        │               │
        browser:     fetch/axios   WebSocket(Worker)   localStorage/IndexedDB
        node/shell:  fetch(내장)    ws                  memory/file
                        ▲
        구독자:  React 캔버스(useSyncExternalStore) / Agent CanvasBinding / CLI
```

### 3.2 설계 결정과 근거

1. **`transact()` 단위 히스토리.** 히스토리 1엔트리 = 트랜잭션 1개. 사용자 드래그 1회도, 에이전트 툴콜 1회도 각각 undo 1단위. agents 포크의 ToolExecutor와 자연스럽게 맞물린다 (`move_node` 디스패치 → `engine.transact('agent:move_node', ...)`). 구현은 처음엔 스냅샷 방식이어도 된다 — 그래프가 작아 딥카피 비용은 문제가 아니고, 인터페이스만 commit 단위로 잡아두면 나중에 diff 기반(`diffSnapshots` 재활용)으로 교체 가능.
2. **런타임 반영은 히스토리 밖의 별도 쓰기 경로.** socket이 밀어주는 노드 상태/포트 데이터는 `applyRuntime()`으로 반영 — 히스토리에 쌓이지 않고, `toSnapshot`이 런타임 필드를 드랍하므로 dirty에도 잡히지 않는다. (현재 코드도 구조 편집만 checkpoint하는 것과 동등한 시맨틱.)
3. **UI 상태는 엔진 범위 밖.** viewport/selection/tooltip/drag는 브라우저 뷰의 소유물 — `useCanvasStore`에 잔류.
4. **workspace 모듈을 그대로 이식.** snapshot/diff/baseline/rebaseline은 엔진 Repository의 내부가 된다. `willDropStructure`(non-owner editor의 구조 드랍) 시그널은 반드시 유지 — 서버가 200을 주면서 구조를 버리는 걸 감지하는 유일한 장치다.
5. **실행(run)은 엔진 코어에 넣지 않는다.** 실행의 원천은 서버다(runNode + socket 이벤트). 엔진은 socket 이벤트를 상태에 반영하는 리듀서만 갖고, 프론트 블록 실행(`EXECUTE_FUNCTIONS`)은 별도 ExecutionAdapter로 격리한다 (DOM 의존이 코어를 오염시키지 않도록).
6. **포트는 5개.** HttpPort(agents 포크에서 승격), StoragePort(동일), LlmPort(= LlmGateway), **SocketPort(신규)** — 브라우저는 기존 Worker 구현을 어댑터로 감싸고 Node는 `ws`. **AuthPort(신규)** — x-api-key 공급을 localStorage에서 분리 (Node에서는 env/파일).
7. **`CanvasBinding`을 엔진 위에 재구현하고 계약을 확장한다.** `readGraph`/`updateNode`에 `addNode`/`removeNode`/`connect`/`disconnect`를 추가하되 전부 `engine.transact` 경유. 데스크톱 바인딩과 인메모리 바인딩의 구분이 사라지고 — 엔진이 곧 인메모리다 — 에이전트는 무수정으로 브라우저/Node 양쪽에서 돈다.
8. **엔진은 정책 중립(mechanism, not policy).** 권한 게이트는 호출자 소관 — UI는 기존 `permissions` 체크, 에이전트는 ToolExecutor의 grant 체크. 엔진 API에 권한 파라미터를 넣지 않는다. (한 곳에 몰고 싶어지면 Phase 2 이후 재논의.)

### 3.3 마이그레이션 로드맵

- **Phase 0 — 순수 코드 이식 (리스크 없음).** `libs/engine` 신설, workspace/\*·graphId·transformNodes·그래프 유틸 이식 + 스토어 결합 제거. 기존 코드는 re-export로 무중단.
- **Phase 1 — 엔진 코어 + 브라우저 전환.** Document/GraphOps/History/Clipboard/Events 구현, `WorkflowCanvas`의 undo·redo·복붙·구조편집을 엔진 호출로 치환(스트랭글러). 복붙의 엣지 포함 문제도 함께 해결.
- **Phase 2 — 영속화 포트 + Node 증명.** Repository(load/save/blocks) + HttpPort/AuthPort. **완료 조건: Node CLI에서 `load → 노드 추가 → undo → redo → save`가 도는 것.** 이게 되는 순간 블랙박스 모델은 증명된 것이다.
- **Phase 3 — 소켓 + 에이전트 통합.** SocketPort(browser/node 어댑터), 실행 상태 리듀서, agents 포크의 CanvasBinding 교체 + 툴 확장. 이후 LLM 백엔드 프록시 게이트웨이를 붙이면 서버측 에이전트 실행까지 열린다.

Phase 0–1의 파일 단위 작업 명세와 완료 조건은 [PLAN.md](./PLAN.md).

### 3.4 리스크 / 주의점

- **마이그레이션 표면적**: `WorkflowCanvas` ref를 직접 부르는 코드가 많다 (socket handlers의 `loadWorkflow`/`updateNodeFromServer` 등). 한 번에 다 바꾸지 말고 편집 경로부터 (PLAN의 미러 모드 참조).
- **저장 시맨틱**: 서버 save는 전체 교체(빠지면 삭제). 엔진 save는 항상 전체 스냅샷 — 부분 저장 최적화 유혹을 경계.
- **ID charset 규칙**(`:` `-` `@` 선행`#` 금지)을 엔진이 소유하고 문서화 — 서버 DynamoDB 키 빌더와의 암묵 계약이다.
- **Node 런타임**: `.nvmrc` v22 기준 global fetch OK. WebSocket은 내장보다 `ws` 어댑터가 안전.
- **agents 포크 코드는 버리지 않는다**: 포트들은 그대로 엔진의 포트 계층으로 승격. 다시 쓰는 건 CanvasBinding 계약과 데스크톱 바인딩뿐.
