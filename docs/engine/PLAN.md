# PLAN — `@flows/engine` Phase 0–4 실행 계획

> 배경/아키텍처/근거는 [DESIGN.md](./DESIGN.md). 이 문서는 **실행 명세**다.
> Phase 4(헤드리스 실행)는 DESIGN §3.3 로드맵에는 없다 — Phase 2의 "블랙박스 증명"을
> 편집에서 **실행**까지 밀어붙이는 후속으로, §7에서 명세한다.
> Claude Code 사용법: "PLAN.md의 Phase 0을 실행해" → Phase 0의 완료 조건이 전부 통과하면 Phase 1로.
> 각 Phase는 독립 PR 크기. Phase 내 스텝 순서는 지켜야 한다 (뒤 스텝이 앞 스텝 산출물에 의존).

---

## 0. 작업 규칙

- 레포 CLAUDE.md 준수: **named export only**, arrow function, 4-space, single quote, import 순서(외부 → `@flows/*` → 상대 → type).
- 타입체크는 반드시 `npx tsc -b apps/web/tsconfig.app.json` (`-p --noEmit` 금지 — CLAUDE.md의 함정 설명 참조).
- 커밋은 conventional commits (commitlint 활성). Phase 0 이식 커밋과 Phase 1 기능 커밋을 섞지 말 것.
- `libs/engine`은 **React/DOM/zustand import 금지**. `tsconfig.lib.json`의 `lib`을 `["ES2022"]`로 잡아 DOM 타입을 컴파일 타임에 차단한다. `crypto.randomUUID`는 `globalThis.crypto` 경유 (브라우저/Node 22 공통).
- 기존 파일을 옮길 때는 `git mv` 후 원위치에 re-export shim을 남긴다 (호출부 무변경). shim 제거는 별도 후속 작업.

## 1. 불변식 — 깨지면 안 되는 것들

리팩토링 중 조용히 깨지기 쉬운 순서로 나열. 각 항목은 관련 파일의 주석에 근거가 있다 — **주석도 함께 이식할 것.**

1. **save는 전체-교체.** save body에서 빠진 노드/엣지는 서버가 삭제한다. 부분 패치 전송 금지. (`useFlows.saveCurrentFlow` 주석)
2. **rebaseline은 "전송한 스냅샷"으로만.** 응답 도착 시점의 워킹 카피로 baseline을 잡으면 in-flight 편집이 유실된다. (`workspace/baseline.ts`)
3. **`willDropStructure` 시그널 보존.** non-owner editor의 구조 변경은 서버가 200을 반환하며 드랍한다. `structureDropped` 반환값과 그 소비자(`saveCurrentFlow`, `runGate`)의 시맨틱을 유지. (`workspace/baseline.ts`, `workspace/runGate.ts`)
4. **`toSnapshot`은 런타임 필드를 드랍한다.** 실행(status/state, inputData, outputData, executionStats)이 flow를 dirty로 만들면 안 된다. (`workspace/snapshot.ts`)
5. **edge diff: 재-포인팅 = 삭제+추가.** 엣지에 modified 버킷 없음. (`workspace/diff.ts`)
6. **ID charset.** 클라이언트 생성 ID가 canonical. hex + 접두 문자만 사용, `:`(포트 참조) `@`(런 참조) `-`(DynamoDB 키 rewrite 충돌) 선행`#`(삭제 마커) 금지. (`utils/graphId.ts` 주석 전체 이식)
7. **baseline 캡처 타이밍.** 캔버스가 정규화한 그래프에서, blockRegistry 로드 후에만. raw load 응답으로 캡처하면 로드 직후부터 dirty로 읽힌다. (`workspace/baseline.ts` 주석)
8. **load 응답의 `edges`/`connections` 겸용 처리** (legacy 폴백) — `GraphLike` 시그니처 유지.
9. **런타임 반영은 히스토리에 쌓이지 않는다.** 현재도 socket발 `updateNode`는 checkpoint하지 않는다. 엔진에서는 `applyRuntime` 경로로 분리 (아래 API).

## 2. 확정 API (v1)

이 시그니처가 계약이다. 임의 변경 금지 — 바꿀 이유가 생기면 PLAN을 먼저 고친다.

```ts
// libs/engine/src/engine.ts
import type { EdgeData, NodeData, Position, WorkflowState } from '@lemoncloud/eureka-flows-api';

export interface FlowEngine {
    // ── 읽기 / 구독
    getGraph(): Readonly<WorkflowState>; // { nodes, edges } — 반환 배열은 복사본
    subscribe(listener: (event: EngineEvent) => void): () => void;

    // ── 편집: 모든 구조 변이는 transact 안에서만 (밖에서 ops 호출 시 throw)
    transact(label: string, fn: (ops: GraphOps) => void): void; // 1 transact = 1 undo 단위
    undo(): boolean;
    redo(): boolean;
    canUndo(): boolean;
    canRedo(): boolean;

    // ── 런타임 반영 (히스토리 미기록, dirty 미발생 — 불변식 4·9)
    applyRuntime(nodeId: string, patch: Partial<NodeData>): void;

    // ── 클립보드 (직렬화 가능 페이로드 — 프로세스 밖 클립보드 연동 대비)
    copy(nodeIds: string[]): ClipboardPayload; // 선택 집합 내부 엣지 포함
    paste(payload: ClipboardPayload, offset?: Position): string[]; // 재-ID, 런타임 리셋, 새 노드 id 반환

    // ── 문서 수명주기 (Phase 1은 로컬만; 서버 load/save는 Phase 2의 Repository)
    loadGraph(state: WorkflowState): void; // 정규화(config/position 기본값, 엣지 dedup) + 히스토리 리셋
    reset(): void;
}

export interface GraphOps {
    addNode(input: {
        type: string;
        position: Position;
        config?: Record<string, unknown>;
        customLabel?: string;
    }): string;
    updateNode(id: string, patch: Partial<NodeData>): void;
    removeNodes(ids: string[]): void; // 부속 엣지 자동 제거
    connect(input: { sourceNodeId: string; sourcePortId: string; targetNodeId: string; targetPortId: string }): string;
    disconnect(edgeIds: string[]): void;
}

export type EngineEvent =
    | { type: 'graph:changed'; label: string } // transact 커밋 / undo / redo / paste
    | { type: 'graph:runtime'; nodeId: string } // applyRuntime
    | { type: 'graph:loaded' }
    | { type: 'history:changed'; canUndo: boolean; canRedo: boolean };

export interface ClipboardPayload {
    nodes: NodeData[];
    edges: EdgeData[]; // 복사 시점에 내부 엣지만 필터됨
}
```

결정 사항 (논쟁 방지용 명문화):

- **D1. 이벤트는 commit 단위 coarse-grained.** 필드 단위 이벤트 없음. React 바인딩은 어차피 nodes/edges 참조 교체를 구독한다.
- **D2. 히스토리 v1은 스냅샷 방식** (structuredClone, 상한 100개). diff 기반 최적화는 인터페이스 변경 없이 나중에.
- **D3. 엔진은 권한을 모른다.** `canModifyCanvas` 게이트는 호출자(UI 콜백 / 에이전트 ToolExecutor) 소관. 엔진 API에 grant 파라미터를 넣지 않는다.
- **D4. 내부 구현은 plain TS + 자체 emitter.** zustand 비의존 (엔진이 UI 라이브러리에 핀되지 않도록). React 쪽은 `useSyncExternalStore` 훅 하나로 바인딩.
- **D5. `connect`는 검증 실패 시 throw** (`EngineError` with code: `CYCLE`, `DUPLICATE_EDGE`, `INCOMPATIBLE_PORTS`, `NODE_NOT_FOUND`). transact는 throw 시 해당 트랜잭션 전체 롤백.
- **D6. UI 상태(viewport/selection/tooltip/drag/collapse)는 엔진 범위 밖** — `useCanvasStore`에 잔류.

## 3. Phase 0 — 순수 코드 이식

목표: 헤드리스 재사용 가능한 순수 모듈을 `libs/engine`으로 옮긴다. **동작 변경 0.**

### P0-1. lib 스캐폴딩

- `libs/engine/` 생성 — `libs/flows`의 `package.json` / `tsconfig.json` / `tsconfig.lib.json` 구성을 미러링하되:
    - 패키지명 `@flows/engine`
    - `tsconfig.lib.json`: `"lib": ["ES2022"]` (DOM 제외)
    - vitest: `eureka-flow-agents`의 `libs/agent/vite.config.mts` 패턴 참고, `environment: 'node'`
- `tsconfig.base.json` paths에 `@flows/engine` → `libs/engine/src/index.ts` 추가
- `libs/flows`가 `@flows/engine`을 의존하도록 (역방향 금지 — engine은 flows를 import하지 않는다. 단 타입 패키지 `@lemoncloud/eureka-flows-api`는 공용)

### P0-2. 파일 이동 인벤토리

| 원본                                                                                                                                            | 대상                                            | 처리                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| `libs/flows/src/workspace/diff.ts`                                                                                                              | `libs/engine/src/persistence/diff.ts`           | 그대로 (pure)                                                          |
| `libs/flows/src/workspace/snapshot.ts`                                                                                                          | `libs/engine/src/persistence/snapshot.ts`       | 그대로 (transformNodes 의존은 같이 이동)                               |
| `libs/flows/src/workspace/flowJson.ts`                                                                                                          | `libs/engine/src/persistence/flowJson.ts`       | 그대로 (pure)                                                          |
| `libs/flows/src/utils/transformNodes.ts`                                                                                                        | `libs/engine/src/persistence/transformNodes.ts` | 그대로                                                                 |
| `libs/flows/src/utils/nodeHeight.ts`                                                                                                            | `libs/engine/src/persistence/nodeHeight.ts`     | transformNodes 의존성 — DOM 미사용 확인 후 이동                        |
| `libs/flows/src/utils/graphId.ts`                                                                                                               | `libs/engine/src/core/ids.ts`                   | 그대로 + **주석 전체 보존** (불변식 6). `crypto` → `globalThis.crypto` |
| `apps/web/.../flows/utils/graph.ts` (`wouldCreateCycle`)                                                                                        | `libs/engine/src/core/cycle.ts`                 | 그대로 (pure)                                                          |
| `apps/web/.../flows/utils/index.ts` 중 `deduplicateEdges`, `getConnectionKey`, `isValidConnection`, `arePortTypesCompatible`, `getPortStyleKey` | `libs/engine/src/core/edges.ts`                 | DOM 무관 함수만 추출 이동. 파일/이미지/업로드 관련 함수는 잔류         |
| `libs/flows/src/types/index.ts` 중 `BlockDefinitionWithFrontend`, `NodeState`, `isNodeState` 등 그래프 코어 타입                                | `libs/engine/src/types.ts`                      | 이동 후 flows에서 re-export                                            |

각 원위치에는 re-export shim (`export * from '@flows/engine/...'` 형태가 아니라 배럴 경유: `export { ... } from '@flows/engine';`) — 호출부 무변경.

### P0-3. 스토어 결합 제거

`workspace/baseline.ts` / `draft.ts` / `runGate.ts`는 `useFlowsStore.getState()`에 결합돼 있다:

- 순수 코어를 `libs/engine/src/persistence/baseline.ts`로: 상태를 **인자로 주입** —
  `captureBaseline(graph, blockRegistry)`, `rebaseline(sent, ctx: { baseline, isEditable, hasOwned })`, `diffAgainstBaseline(graph, ctx)`, `runRequirement(graph, ctx)` 등.
- 기존 `libs/flows/src/workspace/*.ts`는 스토어에서 ctx를 읽어 순수 함수를 호출하는 **thin wrapper로 유지** (기존 시그니처 그대로 → 호출부 무변경).
- `draftStorage.ts`(IndexedDB)는 **이동하지 않는다** — 브라우저 어댑터. Phase 2에서 StoragePort 뒤로 들어간다.

### P0-4. 신규 테스트 (이식 검증)

`libs/engine/src/__tests__/`:

- `diff.spec.ts` — added/removed/modified 노드, 엣지 재-포인팅 = 삭제+추가, canonical 키 순서 무관
- `ids.spec.ts` — charset 규칙 (`:` `-` `@` `#` 부재, hex+prefix)
- `cycle.spec.ts` — self-loop / 간접 사이클 / 무사이클
- `snapshot.spec.ts` — 런타임 필드 드랍 (불변식 4)

### Phase 0 완료 조건

```bash
npx nx test engine                          # 신규 스펙 전부 green
npx nx test flows                           # 기존 스펙 무깨짐 (i18nServerKey, permissions)
npx tsc -b apps/web/tsconfig.app.json       # 클린
yarn lint                                   # 클린
```

- `libs/engine/src/**`에 `react`/`react-dom`/`zustand`/`@flows/flows` import 0건 (`grep -r` 확인)
- ~~웹앱 수동 스모크: 로드 → 편집 → 저장 → dirty 표시 동작 동일~~ — **미실행 (남은 항목)**.
  `apps/web/.env`가 실 DEV 백엔드(`api.eureka.codes/flw-d1`)를 가리켜 로그인 자격이 필요하고,
  save가 실제 flow를 건드린다. 대신 확인한 것: `nx build web` green (실 CI 게이트인 prod 빌드),
  vite dev server에서 `@flows/engine` 및 소비 모듈 트랜스폼 200/에러 0, jsdom 174 스펙 green —
  **모듈 해석은 3개 모드(prod·dev·test) 전부 검증됨**. 남은 건 UI 거동 육안 확인뿐.

> **선행 결함 (Phase 0 밖).** `npx tsc -b apps/web/tsconfig.app.json`은 이 작업 **전부터** red다
> (HEAD 기준 1200 errors). 두 원인 모두 engine과 무관:
>
> 1. `@lemoncloud/eureka-flows-api@0.26.609`에 `Connection` export가 없다 (패키지 dist 전체에 0건).
>    `useCanvasStore`·`types/index.ts` 등 레포 전역이 이 타입을 쓴다 → TS2305 12건.
> 2. `theme`/`ui-kit`/`web-core`/`shared`/`policy`의 `tsconfig.lib.json`이 `module: nodenext`인데
>    `include`가 `src/**/*.ts`뿐이라 `.tsx`가 빠지고 확장자 없는 상대 import가 전부 에러 → TS2834/2835 135건.
>
> 두 결함 때문에 **모든 lib이 `.d.ts`를 emit하지 못하고**(`noEmitOnError: true`) 나머지 ~1050건은
> 그 TS6305/implicit-any 캐스케이드다. Phase 0 전후 **코드별 에러 수 동일**(TS2305 12→12 등),
> 늘어난 29줄은 전부 engine이 같은 이유로 emit 못 해서 생긴 캐스케이드다. 새 root-cause 0건.
> 별건으로 처리할 것 — 고치면 1200건이 한 번에 사라진다.

---

## 4. Phase 1 — 엔진 코어 + WorkflowCanvas 전환

목표: §2의 `FlowEngine`을 구현하고, `WorkflowCanvas`의 그래프 소유권을 엔진으로 이관한다.

### P1-1. 코어 구현

```
libs/engine/src/
├── core/
│   ├── document.ts      # FlowDocument: nodes/edges 보관 + emitter (plain TS, D4)
│   ├── ops.ts           # GraphOps 구현 — connect는 cycle/dedup/port호환 검증 (D5)
│   ├── history.ts       # 스냅샷 스택 past/future, cap 100 (D2)
│   ├── clipboard.ts     # copy: 내부 엣지 필터 / paste: ID 매핑 재작성 + 런타임 리셋
│   ├── ids.ts           # (P0)
│   ├── cycle.ts         # (P0)
│   └── edges.ts         # (P0)
├── persistence/          # (P0)
├── engine.ts            # createFlowEngine(): FlowEngine 조립
├── types.ts
└── index.ts
```

구현 노트:

- `paste`의 ID 매핑: `oldId → newNodeId()` 테이블을 만들고 노드와 **내부 엣지의 source/target 모두** 재작성. 엣지 id도 `newEdgeId()`. 런타임 리셋은 기존 붙여넣기 코드의 필드 목록 그대로 (`state:'IDLE'`, `status:'IDLE'`, `inputData:{}`, `outputData:{}`, `errorMessage: undefined`, config 딥카피).
- `loadGraph` 정규화: 기존 `WorkflowCanvas`의 initialData 처리와 동일 — `config ?? {}`, `position ?? {x:0,y:0}`, `deduplicateEdges`.
- `transact` 롤백: fn 진입 전 스냅샷을 잡고, throw 시 복원 후 재-throw.

### P1-2. React 바인딩 — 미러 모드 (과도기 전략)

한 번에 셀렉터를 다 바꾸지 않는다. **엔진 → `useCanvasStore` 단방향 미러**로 시작:

- `apps/web/.../flows/hooks/useEngineMirror.ts`: `engine.subscribe()`에서 `useCanvasStore.setState({ nodes, connections })` 호출. 기존의 모든 셀렉터/컴포넌트(`NodeBlock`, `Minimap`, socket handlers의 읽기 등)는 무수정으로 동작.
- 엔진 인스턴스는 `FlowEditorPage`에서 생성 (`useMemo`), props/context로 `WorkflowCanvas`에 전달.
- **쓰기 경로만** 엔진으로 강제: `useCanvasStore.setNodes/setConnections` 직접 호출을 편집 경로에서 제거.

### P1-3. WorkflowCanvas 치환 매핑

| 현재 (WorkflowCanvas.tsx)                             | 대체                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `saveCheckpoint()` + `setNodes`/`setConnections` 조합 | `engine.transact(label, ops => ...)`                                                  |
| `undo`/`redo` (pastRef/futureRef)                     | `engine.undo()` / `engine.redo()` — ref는 삭제                                        |
| ref `addNode(type, position)`                         | `transact('node:add', ...)`                                                           |
| `duplicateNode`                                       | `transact('node:duplicate', ...)` (내부적으로 copy/paste 재사용)                      |
| keydown Ctrl+C / Ctrl+V (`clipboard` local state)     | `engine.copy(selectedIds)` / `engine.paste(payload, {x:40,y:40})` — local state 삭제  |
| Delete/Backspace (노드+부속엣지 / 엣지)               | `transact('selection:delete', ops.removeNodes / ops.disconnect)`                      |
| 연결 생성 (connectionDraft 완료 시)                   | `transact('edge:connect', ops.connect)` — 검증 실패 throw는 토스트로                  |
| ref `updateNode` (socket 상태 갱신용)                 | `engine.applyRuntime`                                                                 |
| ref `updateNodeFromServer`                            | `engine.applyRuntime` (force 옵션 로직은 호출부 유지)                                 |
| ref `loadWorkflow` / `clearWorkflow` / `newWorkflow`  | `engine.loadGraph` / `engine.reset` (포트 데이터 fetch 등 부수 작업은 호출부 잔류)    |
| `onChange` → auto-save/draft 트리거                   | `engine.subscribe(e => e.type === 'graph:changed' && onChange())`                     |
| 드래그 종료 (위치 확정)                               | `transact('node:move', ops.updateNode)` — 드래그 **중** 프리뷰는 UI 로컬, 확정만 커밋 |

권한: 각 UI 콜백의 기존 `permissions.canModifyCanvas` 체크는 그 자리에 유지 (D3).

`WorkflowCanvasRef`의 undo/redo는 시그니처 유지 (Header 등 호출부 무변경), 내부만 엔진 위임.

### P1-4. 신규 테스트

- `history.spec.ts` — transact/undo/redo 왕복, transact 중 throw 롤백, cap
- `clipboard.spec.ts` — **내부 엣지 포함 복붙** (신규 스펙 — 기존 동작 대비 유일한 의도된 변경), 재-ID 유일성, 외부로 나가는 엣지 제외, 런타임 리셋
- `ops.spec.ts` — connect의 cycle/dedup/포트호환 거부, removeNodes의 부속 엣지 정리
- `engine.spec.ts` — 이벤트 발행 순서, applyRuntime이 히스토리/dirty에 안 잡힘

### Phase 1 완료 조건

```bash
npx nx test engine && npx nx test flows && yarn web:test
npx tsc -b apps/web/tsconfig.app.json
yarn lint
```

- `WorkflowCanvas.tsx`에서 `pastRef`/`futureRef`/`clipboard` useState **삭제됨** (grep 0건). 복사 페이로드는
  렌더에 안 쓰이므로 `useRef`로 보관 — state면 Ctrl+C마다 캔버스 전체가 리렌더된다.
- `setConnections` 0건. `setNodes`는 **2건 잔존** — 드래그 중 프리뷰(마우스/터치) 뿐이고, 이는 PLAN이
  명시한 "드래그 중 프리뷰는 UI 로컬, 확정만 커밋"이다. 확정은 `commitDrag` → `transact('node:move')`.
- vitest `environment: 'node'`에서 engine 스펙 전체 green — **이것이 이식성의 조기 증명이다** (jsdom 아님)
- ~~웹 수동 스모크~~ — **미실행 (남은 항목)**. Phase 0과 같은 이유(실 DEV 백엔드 + 로그인 자격).
  대신: prod 빌드 green, vite dev server에서 migrate된 4개 모듈 트랜스폼 200/에러 0, jsdom 174 스펙 green.

### 계약 보강 (구현 중 확정)

- **`createFlowEngine(options)`** — `getBlockRegistry?: () => Record<string, BlockDefinitionWithFrontend>`.
  §2가 무인자였지만 `INCOMPATIBLE_PORTS`(D5)를 판정하려면 포트 정의가 필요하다. 값이 아니라 **getter**인 이유:
  registry는 네트워크로 늦게 오므로, 생성 시점 스냅샷으로 잡으면 세션 내내 타입 체크가 꺼진다. 생략 시 그 검사만 skip.
- **`connect`의 점유된 입력 포트** — 같은 연결이 이미 있으면 `DUPLICATE_EDGE` throw, **다른** 소스가 점유된
  입력 포트로 오면 기존 엣지를 **교체**(기존 캔버스 동작). 두 케이스를 D5의 한 코드로 뭉뚱그리지 않는다.
- **`getGraph()`는 얕은 복사** — 배열은 매번 새 것(구독자가 변경을 감지하는 근거), 노드 객체는 공유.
  엔진 내부가 전부 immutable이라 안전하고, base64 이미지를 든 그래프를 매 이벤트마다 deep clone하면
  미러가 감당 못 한다. 히스토리 스냅샷만 `structuredClone`.
- **`paste`는 오프셋을 그대로 더한다** — 그리드 스냅은 UI 정책이라 엔진 밖. 노드 위치는 이미 정렬돼 있으므로
  그리드 배수 오프셋이면 정렬이 유지된다.

### 명시적 스펙 변경 (1건)

- 복사/붙여넣기가 선택 집합 **내부 엣지를 포함**하게 된다. 기존: 노드만. 의도된 개선이며 되돌리지 말 것.

---

## 5. Phase 2 — 영속화 포트 + Node 증명

목표: 그래프를 서버와 주고받는 경로를 포트 뒤로 옮기고, **브라우저 없이** 도는 것을 실행 가능한 산출물로 증명한다.
DESIGN §3.3의 완료 조건이 이 Phase의 유일한 판정 기준이다.

### P2-1. 포트 (2개만)

DESIGN §3.2.6은 포트 5개를 예고하지만 이번 Phase는 **HttpPort / AuthPort 둘 뿐**이다.
`StoragePort`(draftStorage)·`SocketPort`·`LlmPort`는 각각 쓰이는 Phase에서 만든다 — 설계 문서에 이름이 있다는
이유로 미리 만드는 건 CLAUDE.md가 금지하는 speculative abstraction이다.

| 파일                                        | 내용                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `libs/engine/src/ports/http.ts`             | `HttpPort` — `request<T>({ method, path, body, query })`                                                                             |
| `libs/engine/src/ports/auth.ts`             | `AuthPort` — `getApiKey()` + `endpointPath()`. `apiEndpointPath()`는 web-core에서 이식 (`null → /public`, `'#' → ''`, else `/_api_`) |
| `libs/engine/src/adapters/fetchHttpPort.ts` | 전역 `fetch` 어댑터. Node 22 내장 fetch = 브라우저와 같은 코드                                                                       |

### P2-2. Repository

`libs/engine/src/repository/flowRepository.ts` — P0-3에서 순수화해 둔 workspace 규칙의 **소유자**.
`useFlowsStore`가 들고 있던 `WorkspaceContext`(baseline/blockRegistry/isEditable/hasOwned/currentFlowId)를
Repository가 내부에 들고 load/save마다 갱신한다. 이것이 P0-3을 한 이유다.

- `loadBlocks()` — 블록 정의 캐시. 엔진의 `getBlockRegistry`가 여기를 읽는다.
- `load(flowId)` — GET `/flows/:id/load` → `engine.loadGraph` → **정규화된 그래프에서** baseline 캡처.
  블록이 없으면 먼저 로드한다 — 불변식 7을 호출 순서 규약이 아니라 구조로 강제.
- `isDirty()` — `diffAgainstBaseline`.
- `save()` — `toSnapshot` 전체를 POST (불변식 1: 전체-교체, 부분 저장 최적화 금지) →
  성공 시 **전송한 스냅샷으로** rebaseline (불변식 2) → `{ flowId, structureDropped }` 반환 (불변식 3).

`createFlowWorkspace({ http, auth })` → `{ engine, repository }`. 엔진의 `getBlockRegistry`와 Repository가
서로를 필요로 하는 매듭을 한 곳에서 묶는다. CLI/에이전트가 실제로 원하는 조립 단위.

### P2-3. Node CLI 데모

`libs/engine/src/cli/` — `demo.ts`(순수, 주입받은 워크스페이스로 시나리오 실행) + `main.ts`(Node 엔트리).
배럴에서 export하지 않는다 — 브라우저 번들이 `process`를 끌어갈 이유가 없다.

```bash
yarn engine:demo          # 스텁 HttpPort (네트워크 없음, 결정적)
FLOW_API_KEY=... FLOW_API_URL=... yarn engine:demo --real --flow <id>
```

esbuild로 번들 후 `node`로 실행. 엔진은 **런타임 의존성이 0개**라(API 패키지는 type-only) 번들이 자기충족적이다.

### Phase 2 완료 조건

```bash
yarn engine:demo                            # load → add → undo → redo → save 가 실제로 돈다
npx nx test engine && npx nx test flows && npx nx test web
yarn lint && npx nx build web
```

- 데모가 브라우저 없이 완주하고 save body가 전체 스냅샷임을 출력으로 확인
- `libs/engine/src/**`에 `react`/`react-dom`/`zustand`/DOM 전역 참조 0건 유지
- Repository 스펙이 불변식 1·2·3·7을 각각 잡는다

---

## 6. Phase 3 — 소켓 + 실행 상태

목표: 서버가 밀어주는 실행 상태를 엔진이 해석하게 만든다. DESIGN §3.3의 Phase 3 중 **이 레포에 속한 부분**.

> **범위 밖 (별건).** agents 포크(`eureka-flow-agents`)의 `CanvasBinding` 재구현 + 툴 확장은 **다른 레포**다.
> 엔진이 곧 인메모리 바인딩이므로 계약은 이미 준비됐지만, PR이 갈라지므로 여기서 건드리지 않는다.

### P3-1. SocketPort

| 파일                                        | 내용                                                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `libs/engine/src/ports/socket.ts`           | `SocketPort` — `connect()` / `close()` / `subscribe(listener)` / `status()`. 메시지는 파싱 전 raw string |
| `libs/engine/src/adapters/webSocketPort.ts` | 전역 `WebSocket` 어댑터 + 지수 백오프 재연결                                                             |

Node 22는 `WebSocket`을 전역으로 갖는다 (`fetch`와 동일). DESIGN §3.4가 `ws` 패키지를 권했지만
**의존성을 추가하지 않는 쪽**을 택한다 — 어댑터 하나가 브라우저·Node 양쪽을 덮고, 동기화할 분기가 없다.
브라우저의 기존 Worker 구현(`useWebSocketWorker`)은 그대로 두고 Phase 4 이후 이 포트 뒤로 감싼다.

### P3-2. 실행 상태 리듀서 (핵심)

`libs/engine/src/runtime/executionReducer.ts` — **순수 함수**. 지금 `useSocketHandlers.ts`의 ref 5개
(`nodeNoRef`/`nodeRunIdRef`/`portNoRef`/`portRunIdRef`/`progressSeqRef`)에 흩어져 있는 순서 판정을 한곳으로.

`(state, event) → { state, effects }`. 엔진이 소유하는 것은 **무엇을 무시할지와 어떤 patch를 적용할지**뿐이고,
토스트·`getNode` 조회·`executeNode` 예약 같은 부수효과는 `effects` 배열로 내보내 호출자가 해석한다.

리듀서가 소유하는 규칙 (전부 현재 코드에서 이식, 각각 스펙으로 고정):

1. **stale sequence 드랍** — 같은 노드에서 `no <= 이미 본 no`면 무시. 소켓은 순서를 보장하지 않는다.
2. **runId 교체 = 새 실행** — 시퀀스와 progress seq를 리셋하고 노드를 IDLE로 강제.
   이게 없으면 상태 우선순위(COMPLETED > RUNNING)가 재실행 업데이트를 막는다.
3. **다른 flow의 메시지 무시** — `flowId`가 있고 현재 flow와 다르면 드랍.
4. **상태 우선순위** — `shouldUpdateState` (ERROR가 최상위 terminal). 이식하되 시맨틱 불변.
5. **port 이벤트는 부모 노드로** — `isPort && parentNodeId`면 부모 상태만 갱신하고 끝.

### P3-3. 스트랭글러 — `useSocketHandlers` 전환

기존 훅은 리듀서를 호출하고 effect를 해석하는 얇은 층이 된다. 호출부(`useInitFlowSocket` 콜백) 무변경.

### Phase 3 완료 조건

```bash
npx nx test engine && npx nx test flows && npx nx test web
yarn lint && npx nx build web && yarn engine:demo
```

- 리듀서 스펙이 위 규칙 1~5를 각각 잡는다 — **오늘 이 로직에는 테스트가 0개다**
- `useSocketHandlers.ts`에 시퀀스 추적 ref 0건
- 엔진 순수성 유지 (react/zustand/DOM 전역 0건)

## 7. Phase 4 — 헤드리스 실행

목표: Phase 2가 증명한 것은 **편집**의 이식성이었다(load → add → undo → redo → save).
아직 못 하는 것은 **실행**이다 — 엔진은 노드를 돌릴 수도, 서버가 밀어주는 실행 프레임을 혼자
해석할 수도 없다. Phase 3이 리듀서를 만들었지만 그 입력(`NodeEvent`/`PortEvent`)을 만드는
파서는 아직 React 훅 안에 있고, `SocketPort`와 리듀서를 잇는 배선도 없다.

> **범위 밖 (이유 있음).**
>
> - agents 포크의 `CanvasBinding` — 포크에 `libs/engine`이 **없다**. 이 브랜치가 머지되고
>   포크가 리베이스해야 시작 가능. 못 하는 게 아니라 아직 못 하는 상태다.
> - `ExecutionPort`(DESIGN §3.2 #5의 프론트 블록 격리) — 헤드리스 구현체가 0개다.
>   구현이 하나뿐인 인터페이스는 추상화가 아니라 우회로다. 두 번째 소비자가 생길 때 만든다.
> - 브라우저 Worker를 `SocketPort` 뒤로 감싸기 — 어댑터만 두면 아무도 안 쓰는 죽은 코드고,
>   `useInitFlowSocket`(639줄)의 워커 수명주기까지 갈아엎는 건 별도 슬라이스다. P4-4가
>   **파싱만** 공유하게 만들어, 다음에 감쌀 때 남는 차이가 워커 수명주기뿐이도록 좁힌다.

### P4-1. 프레임 파서

`libs/engine/src/runtime/parseSocketFrame.ts` — **순수 함수**. raw 프레임(문자열 또는 객체) →
판별 유니온. 지금 `useInitFlowSocket.ts`에 있는 `parseWebSocketMessage` + 타입 가드 5개 +
`parsePortId`를 이식한다. 반환 페이로드는 리듀서가 이미 받는 타입 그대로다 (`NodeEvent` 등) —
파서와 리듀서 사이에 변환 계층을 두지 않는다.

이식되는 규칙 (각각 스펙으로 고정):

1. **봉투 벗기기** — `{ action: 'message', data: {...} }`는 `data`가 진짜 프레임.
2. **trace 병합** — `action: 'trace'`는 `seq`/`ts`/`stage`가 top-level, `id`는 `data` 안.
   둘을 합쳐야 하나의 프레임이 된다.
3. **포트 ID 해석** — `"1000637:in@in"` → `nodeId` / `portId` / `portName` / `direction`.
   `@`가 없으면 방향은 서버가 정한다(undefined).
4. **`:` 가 든 node 프레임은 포트 프레임** — 부모 노드(`parentNodeId`)의 상태를 말한다.
5. **판별 순서** — `progress:*` / `log:*` 접두사 → `type` 정확 일치 → `seq` 보유(trace).

### P4-2. RunSession

`libs/engine/src/runtime/runSession.ts` — `SocketPort` + `FlowEngine` + 리듀서를 잇는 배선.
프레임을 받아 파싱 → 리듀서 → `apply` effect는 `engine.applyRuntime`으로 직접 반영하고,
브라우저가 필요한 나머지 effect(toast·fetch·autorun)는 그대로 호출자에게 넘긴다.

`waitForNode(nodeId)`가 노드의 종료(`COMPLETED`/`ERROR`)를 기다리는 Promise를 준다 — CLI가
실행 완료를 기다릴 수 있는 유일한 수단이고, 이게 Phase 4 완료 조건의 실행 축이다.

### P4-3. `repository.runNode`

`POST /nodes/:id/run`. 쿼리 파라미터 시맨틱은 `libs/flows/src/api/nodes.ts`에서 그대로 가져온다 —
특히 **`async`/`propagate`는 0/1을 명시 전송**한다 (서버 환경 기본값이 호출자 의도를 덮지 않도록).

### P4-4. 스트랭글러 — `useInitFlowSocket` 파싱 치환

훅의 로컬 가드 5개 + `parsePortId`를 지우고 `parseSocketFrame` 한 번 호출로 바꾼다.
구독자 콜백 시그니처 무변경. 워커 수명주기는 이번 슬라이스에서 건드리지 않는다.

`parseWebSocketMessage`는 **남긴다** — 이건 프레임 해석이 아니라 *주소 판독*이다(스토어가
id로 구독자에게 브로드캐스트한다). 단 봉투 벗기기는 `unwrapSocketEnvelope`로 공유해서,
두 층이 "어떤 payload를 보고 있는지"에 대해 어긋날 수 없게 만든다.

`useSocketRecorder`(리플레이 도구)도 같은 파서로 바꾼다. 기록과 실제 처리가 서로 다른
분류를 쓰면, 리플레이가 재현한다고 주장하는 실행이 사실이 아니게 된다.

### P4-5. `dispatchSocketFrame` 분리 + 소켓 lib 테스트 타깃

훅의 `dispatchMessage` 본문을 `libs/socket/src/hooks/dispatchSocketFrame.ts`로 뺀다 —
React도 소켓도 없는 순수 함수. 이유: **여기가 와이어와 캔버스 사이의 실전 경로인데
테스트가 0개였다.** 파서 스펙은 "프레임이 무엇인가"만 잡고, "누가 통보받는가"는 못 잡는다.

`libs/socket/vite.config.mts` 신설 (flows와 동일 패턴, `environment: 'node'`).

**행위 보존 회귀 1건 발견·수정.** 스트랭글러 1차에서 옛 가드의 `!('nodeId' in msg)` 조건을
빠뜨렸다. 이 조건은 _노드에 대한_ 프레임(포트 row, data response)이 _노드 자신의_ 상태
프레임으로 오인되는 걸 막는 장치다 — 빠지면 캔버스에 없는 id로 토스트가 뜬다.
파서에 복원하고 스펙으로 고정했다.

### Phase 4 완료 조건

```bash
npx nx test engine && npx nx test socket && npx nx test flows && npx nx test web
yarn lint && npx nx build web && yarn engine:demo
```

- `yarn engine:demo`가 **실행까지** 완주: `load → runNode → 소켓 프레임 → COMPLETED → 출력 읽기`
- 파서 스펙이 위 규칙 1~5를 각각 잡는다
- **디스패처 스펙이 "누가 통보받는가"를 잡는다** — grep 결과가 아니라 행위로 판정할 것.
  (1차 완료 조건이 "로컬 파싱 0건"이라는 grep이었던 탓에 위 회귀가 통과했다.)
- `useInitFlowSocket.ts`에 프레임 판별/필드 추출 0건 (봉투 벗기기는 엔진과 공유)
- 엔진 순수성 유지 (react/zustand/DOM 전역 0건)

### 선행 결함 1건 해소 (범위 밖이었으나 불가피)

`libs/socket`이 `@flows/engine`을 참조하게 되면서 엔진의 `.d.ts` 생성이 **load-bearing**이 됐다.
그런데 엔진은 Phase 0 이식 때 딸려온 `Connection` import 3건 때문에 선언을 내보내지 못했다 —
`@lemoncloud/eureka-flows-api@0.26.609`에 그런 export는 **없다**(패키지 dist 전체에서 0건).
의도한 타입은 `EdgeData`였다. 엔진 3파일만 고쳤고(`cycle`/`edges`/`snapshot`), `libs/flows`의
동일 결함은 건드리지 않았다. 결과: 엔진이 처음으로 `.d.ts`를 생성한다.

## 8. 후속 — 타입체크 선행 결함 정리

Phase 0부터 "HEAD에서 이미 red"라고 기록만 해온 두 root cause를 실제로 처리했다.
엔진 자체는 Phase 4에서 이미 emit 가능해졌지만, 소비자 쪽이 막혀 있으면 의미가 없다.

**root cause 1 — `Connection` (해소).** `@lemoncloud/eureka-flows-api`에 없는 타입.
`libs/flows`의 re-export + 소비자 10파일을 `EdgeData`로 정정.

**root cause 2 — lib tsconfig 오설정 (해소).** 5개 lib(`policy`/`shared`/`theme`/`ui-kit`/
`web-core`)이 base의 `moduleResolution: "bundler"`를 `nodenext`로 덮어쓰고 있었다.
Nx 제너레이터 기본값인데 이 워크스페이스는 Vite다 — `nodenext`는 상대 import에 `.js`
확장자를 요구하고(TS2834/2835), Vite는 그런 걸 붙이지 않는다. 덮어쓰기를 걷어내고,
React lib 5개에 `jsx: "react-jsx"`와 `src/**/*.tsx` include를 추가했다
(`flows`/`socket`은 `.tsx`를 include하면서 `jsx`를 선언한 적이 없어 원래부터 TS17004였다).
`import.meta.env`를 쓰는 lib에는 `vite/client` types 추가.

이 과정에서 드러난 **실제 소스 결함 3건**도 고쳤다 (설정이 가리고 있던 것):

- `EnhancedStorage.length`가 private 필드였다. 쓰기마다 갱신은 하지만 **아무도 읽지 않는**
  값이었고(그래서 TS6133), `Storage`는 이걸 public으로 요구한다. 나머지를 다 구현해놓고도
  `implements Storage`를 선언 못 한 이유이자 `as Storage` 캐스팅의 원인. 게터로 교체.
- `WebCoreInstance`가 `ReturnType<typeof WebCoreFactory.create>` — 제네릭을 인자 없이 쓰면
  지원하는 모든 cloud provider로 넓어져 AWS 전용 메서드가 사라진다. `<'aws'>`로 고정.
- `ThemeProvider`의 사용되지 않는 `@ts-expect-error` 1건. 이거 하나가 `theme`의 emit을
  막고 있었고, `ui-kit` 이하 전체가 TS6305로 연쇄했다.

결과: `tsc -b --force` **1073 → 863**. `policy`/`theme`/`web-core`/`engine`이 선언을 생성한다.

**결과: `tsc -b --force` 0건.** 1073 → 863(설정) → 0.

남아 있던 53건의 lib 결함과 앱 쪽 전부를 정리했다. 대부분은 한 가지 원인의 반복이었다 —
**API 패키지의 타입이 서버가 실제로 보내는 것보다 좁거나 틀렸고, 앱은 캐스팅으로 우회해 왔다.**

- `NodeData.id`/`EdgeData.id`가 wire에서는 optional(`''`이 "생성" 신호)이지만 문서 안에서는
  아니다 — 선택도 연결도 삭제도 id로 한다. `GraphNode`/`GraphEdge`가 이걸 말하고,
  `normalize`/`deduplicateEdges`가 들어오는 길목에서 보장을 세운다. 이 하나로 ~120건 해소.
- `DataPacket.type`은 union인데 wire는 문자열을 보낸다 → `toDataPacket`으로 한 곳에서 narrow.
- React 19 변경: `JSX` 전역 제거, `useRef` 0-arg 오버로드 제거, `ElementType`의 `className`이
  `never`로 추론(→ `LucideIcon`).

**이 과정에서 드러난 "항상 undefined였던" 버그 4건** (설정이 가려서 아무도 몰랐다):

1. `blockDef.config$$` — 모바일 config 필드. 블럭에도 노드에도 없는 필드라 항상 undefined였고,
   그래서 블럭의 **필드 정의** 대신 노드의 저장된 key/val이 렌더되고 있었다. → `configSchema`
2. `blockDef.output$` — 데스크톱·모바일 양쪽의 "비terminal 노드의 input 포트는 스킵" 가드.
   필드명이 `outputs`라 가드가 한 번도 발동한 적 없다.
3. `productProgress.isTerminal` — 배포 진행 배지. 존재하지 않는 필드라 완료된 배포에도 계속 떴다.
4. `packet.type === 'markdown'` 4곳 — `markdown`은 서버의 포트 타입 5종에 없다. 항상 false였고,
   실제 판정은 `isMarkdownContent` 내용 검사가 하고 있었다.

## 9. 진행 체크리스트

- [x] P0-1 lib 스캐폴딩 (`@flows/engine`)
- [x] P0-2 파일 이동 + shim
- [x] P0-3 스토어 결합 제거 (baseline/draft/runGate)
- [x] P0-4 이식 검증 테스트
- [x] Phase 0 완료 조건 — `nx test engine` / `nx test flows` / `nx test web` / `yarn lint` / `nx build web` green.
      `tsc -b`는 **HEAD에서 이미 red** (1200 errors, 새 root-cause 0건), 웹앱 수동 스모크는 미실행: §3 참조.
- [x] P1-1 코어 (document/ops/history/clipboard/engine)
- [x] P1-2 미러 모드 바인딩
- [x] P1-3 WorkflowCanvas 치환
- [x] P1-4 코어 테스트 (engine 스펙 83개, `environment: 'node'`)
- [x] Phase 1 완료 조건 — `nx test engine/flows/web` · `yarn lint` · `nx build web` green.
      `tsc -b`는 Phase 0과 같은 선행 결함으로 red (총 에러 1142 → **1127로 감소**), 수동 스모크는 미실행.
- [x] P2-1 포트 (HttpPort / AuthPort + fetch 어댑터)
- [x] P2-2 Repository (`load`/`save`/`loadBlocks`/`isDirty`) + `createFlowWorkspace`
- [x] P2-3 Node CLI 데모 (`yarn engine:demo`)
- [x] **Phase 2 완료 조건 전부 green** — `yarn engine:demo`가 브라우저 없이 완주
      (load 2노드 → add 3노드 → undo 2노드 → redo 3노드 → save, dirty 추적 정상, save body = 전체 그래프).
      engine 스펙 101개, flows 18, web 174, lint 0 error, `nx build web` green.
      `tsc -b` 총 에러 **1127 — Phase 1 대비 증감 0**. 엔진 단독 typecheck는 선행 `Connection` 3건뿐.
- [x] P3-1 SocketPort + 전역 `WebSocket` 어댑터 (재연결 백오프 포함)
- [x] P3-2 실행 상태 리듀서 (node/port/progress) — 규칙 1~5 + `ts` 우선, 커서 롤백
- [x] P3-3 `useSocketHandlers` 전환 — 시퀀스 추적 ref **5개 → 0개**
- [x] **Phase 3 완료 조건 전부 green** — engine 155 (Phase 2의 101 → +54), flows 18, web 174,
      lint 0 error, `nx build web`, `yarn engine:demo` 모두 green.
      `tsc -b` 총 **1126 — Phase 2의 1127보다 1건 감소**. 엔진 순수성 유지.
      **범위 밖**: agents 포크 `CanvasBinding` (다른 레포) — Phase 3의 남은 절반.
- [x] P4-1 프레임 파서 (`parseSocketFrame` + `unwrapSocketEnvelope` + `parsePortId`)
- [x] P4-2 RunSession (`waitForNode` 포함) — 소켓 → 리듀서 → `applyRuntime` 배선
- [x] P4-3 `repository.runNode` (`async`/`propagate` 0/1 명시 전송)
- [x] P4-4 `useInitFlowSocket` + `useSocketRecorder` 파싱 치환 (로컬 가드 6개 → 0개)
- [x] P4-5 `dispatchSocketFrame` 분리 + `libs/socket` 테스트 타깃 신설 (스펙 0 → 22)
- [x] **Phase 4 완료 조건 전부 green** — `yarn engine:demo`가 `load → add → undo → redo →
save → **run**`을 브라우저 없이 완주. 마지막 프레임은 일부러 stale이라, 노드가
      COMPLETED로 남는 것 자체가 순서 규칙이 돌았다는 증거다.
      engine 스펙 221개 (Phase 3의 155 → **+66**), **socket 22개 (신규 타깃)**, flows 18, web 174,
      lint 0 error, `nx build web`, `yarn engine:demo` 모두 green.
      `tsc -b --force` 총 **1061 — 같은 방식으로 잰 HEAD의 1073보다 12건 감소**.
      (이전 Phase의 숫자들은 측정 방식이 달라 직접 비교 불가 — `--force` 없이 재면
      증분 캐시 때문에 값이 흔들린다.)

---

## 9. 실행 시 stale 입력이 서버 포트에 기록되는 결함 (수정 완료)

`/simplify` 리뷰에서 나온 지적을 코드로 확인한 결과 — **실제 결함**이며, 재현 경로가 UI에 있다.
수정은 하지 않았다. 이 문서에 재현 절차와 한 줄 수정안을 남긴다.

### 무엇이 문제인가

`hydrateInputsFromUpstream` (`libs/flows/src/utils/hydrateInputs.ts:20`) 은
`if (hydrated[conn.targetPortId]) continue;` 로 **이미 값이 있는 입력 포트를 건너뛴다.**
의도는 사용자가 수동으로 지정한 입력을 상류 출력이 덮어쓰지 않게 보호하는 것이다.

그런데 그 수동 입력 경로가 **존재하지 않는다.** `executeNode` 의 2번째 인자
`manualOverrideInputs` (`WorkflowCanvas.tsx:1125`) 를 넘기는 호출자가 하나도 없다:

- `WorkflowCanvas.tsx:1374` — `executeNode(nodeId, undefined, options)`
- `WorkflowCanvas.tsx:935` — `executeNodeRef.current(nodeId)`
- `useSocketHandlers.ts:174` — `canvasRef.current?.executeNode(effect.nodeId)`
- 모바일 (`mobile-editor/utils/executeNode.ts:39`) — 오버라이드 슬롯 자체가 없음

즉 `const inputs = manualOverrideInputs || currentNode.inputData` 는 **항상**
`currentNode.inputData` 다. 가드가 지키는 것은 사용자의 의도가 아니라 **이전 실행이
남긴 낡은 그래프 상태**뿐이다.

### 왜 로컬 계산 문제로 끝나지 않는가

`WorkflowCanvas.tsx:1268-1280` 이 실행 직전에 `hydratedInputs` 를 **서버에 upsert 한다**:

```ts
if (permissions.canModifyCanvas && flowId && Object.keys(hydratedInputs).length > 0) {
    await Promise.all(Object.entries(hydratedInputs).map(([portName, packet]) =>
        upsertPortNode(flowId, { ..., name: portName, data$: toPortVariantData(packet) })));
}
```

낡은 패킷이 그대로 서버의 입력 포트 레코드에 기록된다. 이후 **서버가 실행하는**
백엔드 노드는 그 레코드를 읽는다 — 화면만의 문제가 아니다.

### 재현

1. A → B 엣지. A는 백엔드 블록.
2. B의 입력 포트에 A의 이전 실행 결과가 남아 있는 상태.
3. A 선택 → DetailPanel 의 **"이 노드만 실행"** (`DetailPanel.tsx:1150`, `propagate: false`).
   서버는 A만 실행하고 하류로 전파하지 않는다 (`WorkflowCanvas.tsx:1044-1047` 주석 참조:
   전파는 서버의 `propagateDownstreamV2` 담당). 클라이언트 전파는 프론트엔드 블록 경로에만 있다.
   → A의 `outputData` 는 갱신, B의 `inputData` 는 낡은 채로 남는다.
4. B 실행 → `hydrateInputsFromUpstream` 이 "값이 있으니" 건너뛴다 → **낡은 값으로 실행되고,
   그 낡은 값이 서버 포트에 기록된다.**

**대조군**: 3번과 4번 사이에 플로우를 새로고침하면 `propagateData`
(`WorkflowCanvas.tsx:715-736`) 가 로드 시점에 덮어쓰므로 B는 A의 최신 출력으로 실행된다.
**같은 조작인데 중간에 새로고침을 했는지에 따라 결과가 갈린다.**

### 수정안

`hydrateInputsFromUpstream` 의 skip-occupied 가드를 제거하고 상류 출력이 이기게 한다
(로드 시점의 `propagateData` 와 같은 답). 지금은 지켜야 할 수동 입력이 없으므로 한 줄이다.

수동 입력 기능을 나중에 실제로 붙인다면, 그때는 "사용자가 지정함" 과 "이전 실행이 남김" 을
**구분할 수 있어야** 한다 — 값의 존재 여부로는 영원히 구분되지 않는다. 그 시점에
`manualOverrideInputs` 를 살리거나 패킷에 출처 표시를 넣는 것이 진짜 수정이다.

### 적용 결과

skip-occupied 가드 한 줄 제거. 연결된 입력 포트는 항상 상류의 현재 출력을 받는다 —
로드 시점의 `propagateData` 와 같은 답이므로, 새로고침 여부로 결과가 갈리던 것이 사라진다.
연결이 없는 포트는 루프가 방문하지 않으므로 그대로 남는다.

스펙 신설 (`libs/flows/src/utils/hydrateInputs.spec.ts`, 6개) — 이 함수는 그동안
**스펙이 하나도 없었다.** 가드를 되돌리면 6개 중 정확히 1개
("replaces what an earlier run left on a connected port") 만 실패하는 것을 확인했다.
나머지 5개는 양쪽 동작에서 모두 통과한다 — 변경점이 아니라 주변 계약을 고정하는 스펙이다.

두 구현을 `core/edges.ts` 로 합치자는 원안은 채택하지 않았다 — `propagateData`(로드 시 조정)와
`hydrateInputsFromUpstream`(실행 시 수집)은 **역할이 다르다.** 결함은 "두 구현이 다르다"가
아니라 "한쪽이 사용자 의도와 잔여 상태를 구분하지 못한다" 쪽이었고, 고친 것도 그쪽이다.

### 후속 정리 (같이 적용)

- **`executeNode` 의 `manualOverrideInputs` 파라미터 삭제.** 호출자가 하나도 안 넘기던
  죽은 인자였고, 이 결함의 원인이기도 하다. `triggerNode` 의
  `executeNode(nodeId, undefined, options)` → `executeNode(nodeId, options)`.
- **`hydrateInputPorts` (모바일 백엔드 경로) 가 `hydrateInputsFromUpstream` 를 호출하도록 변경.**
  원래 엣지를 직접 순회했는데 — **애초에 skip-occupied 가드가 없어서 덮어쓰기였다.**
  즉 모바일 백엔드 경로는 처음부터 옳았고, 어긋난 쪽은 데스크톱이었다. 두 답이 일치한
  지금 합쳐서, 같은 종류의 드리프트가 다시 생길 자리를 없앤다.

### 부수 확인 (결함 아님)

`propagateData` 만 `'value' in packet` 을 요구하고 나머지 전파 지점은 truthy 만 본다.
그러나 `toDataPacket` 은 항상 `value` 키를 넣으므로(값이 `undefined` 여도 키는 존재)
이 코드베이스에서 갈리는 입력은 생기지 않는다.

---

## 10. Phase 5: 규칙은 엔진으로, 오케스트레이션은 남김

Phase 4 이후 엔진은 **절반만 채택된** 상태였다. 그래프 편집은 엔진이 소유(브라우저가
`createFlowEngine` 사용)하지만, 저장·로드·실행 오케스트레이션은 `repository`/`runSession` 에
구현돼 있으면서 **웹은 여전히 `useFlows` 옛 경로**를 탄다 — 같은 규칙의 구현이 두 벌.

이 Phase의 판별 기준: **`libs/engine` 유닛 테스트로 증명 가능한가.**

- **규칙(rules)** → 이관. 아래 세 슬라이스.
- **오케스트레이션** (TanStack 캐시·saveStatus 상태기계·autosave·retry) → **남김.**
  `flowRepository` 에는 쿼리 캐시 개념이 없고, CLAUDE.md 의 mutation 규칙(`setQueryData`,
  `invalidateQueries` 금지 — 백엔드 eventual consistency)은 전부 `useFlows` 안에 있다.
  이관하면 stale-read 버그가 나는데 이 레포의 어떤 유닛 테스트도 그걸 못 잡고,
  브라우저 스모크는 DEV 자격증명이 없어 못 돌린다. **자격증명 확보 전까지 보류.**

### S1 `mergeNodeView` — HTTP wire 디코딩 (`37c56b6`)

`GET /nodes/:id` 는 config/포트 데이터를 배열(`config$`/`inputData$$`/`outputData$$`)로,
그래프는 객체로 들고 있다. `NodeData` 에는 배열 형태가 선언돼 있지 않아 디코딩이
`useImperativeHandle` 안에서 `Record<string, unknown>` 캐스트로 이뤄지고 있었다 —
테스트 불가, 헤드리스에서 도달 불가. `repository.runNode` 가 이 엔드포인트의 `NodeData` 를
그대로 반환하므로 헤드리스 쪽도 같은 디코딩이 필요하다. 소켓 짝(`parseSocketFrame`) 옆으로 이동.

**필드별 병합 규칙이 다르고, 그게 핵심이라 스펙으로 고정**: config는 치환(완전한 객체가
매번 오므로 병합하면 방금 지운 키가 부활), inputData는 `inputData$$` 면 치환(노드의 전체
입력 상태) / 객체 형태면 병합(포트 하나의 보고), outputData는 항상 병합. 부재 = "변경 없음".
스펙 10개. WorkflowCanvas −58줄, `DataPacket` 임포트도 사라짐.

### S2 `reset-node` — 한 번도 발화한 적 없던 effect (`285c890`)

재실행 시 노드를 IDLE 로 되돌리는 effect. **양쪽 절반이 모두 고장나 있었다**:

1. **리듀서가 잘못된 대상 지목.** 커서는 스트림별이라 포트 프레임은 `n1:out` 으로 키잉되는데,
   상태가 리셋되는 건 **노드**고 `n1:out` 은 노드가 아니다. 두 소비자
   (`updateNodeFromServer`, `applyRuntime`) 모두 그래프에서 id 를 찾다 조용히 실패 —
   **브라우저에서도 no-op** 이었다. Rule 5 가 이미 "포트 이벤트는 부모의 상태를 기술한다"고
   말하고 있었는데 effect 만 그러지 않았다.
2. **`runSession` 이 effect 를 처리 안 함.** `onEffect` 로 넘기고 끝 → CLI 에선 아무도 안 받음.

**왜 안 잡혔나**: 거의 모든 경로에서 `apply` 가 바로 뒤따라 stale 상태를 덮어써 최종 결과가
같다. 유일하게 관측되는 건 **상태 없는 포트 프레임** — 리셋이 유일한 effect 인 경우.
스펙이 그 경로를 치고, 두 절반을 **각각** 되돌려 실패를 확인했다.

> **폐기한 접근**: 원안은 `applyRuntime` 에 monotonicity 게이트를 넣는 것이었다. 버렸다 —
> `WorkflowCanvas.tsx:1080` 이 매 실행 시작에 RUNNING 을 쓰는데, COMPLETED 노드 재실행이면
> RUNNING(2) < COMPLETED(3) 이라 게이트가 **재실행 자체를 막는다**. 호출자마다 `force` 를
> 넘기면 게이트는 장식만 남는다. 실제 격차는 게이트가 아니라 누락된 effect 핸들러였다.

### S3 `loadGraph` 단일 ingress (`718dde6`, `007e28c`)

플로우 로드가 **누가 부르냐에 따라 다른 그래프**를 만들고 있었다. 캔버스는 id 민팅 →
중복 엣지 제거 → 포트 값 병합 → 엣지 전파를 하고 `loadGraph` 에 넘겼고, `loadGraph` 는
그걸 또 normalize 했다. repository 는 원본 응답으로 `loadGraph` 를 불러 **뒤의 두 패스를
전혀 받지 못했다** — 헤드리스 로드는 포트 값도 없고 하류 입력도 비어 있었다.

두 패스는 React 가 없는 순수 그래프 함수라 엔진으로 이동, `loadGraph(state, { ports })` 가
유일한 입구가 됐다. 캔버스의 복사본과 함께 `newNodeId`/`deduplicateEdges` 의 마지막 사용처도
사라졌다 — `normalize` 를 재구현하느라 있던 것들이다. `normalize` 는 레거시 `connections`
필드도 읽는다(캔버스엔 있고 엔진엔 없던 같은 종류의 격차).

**바꾸지 않고 보존한 것 2가지** (바꾸면 데이터가 이동한다): 포트 방향은 행의 `direction`
필드가 아니라 **포트 이름(`out`)** 으로 판정 — 로드 경로가 늘 그래왔다. 전파는
`'value' in packet` 을 요구 — 읽혔지만 아무것도 생산하지 않은 포트는 옮길 데이터가 아니다.

후속: `LoadFlowPortData` 가 엔진 `PortRow` 를 extends. 같은 세 필드를 라이브러리 하나 건너
다시 선언하고 있었다.

### 게이트

`tsc -b --force` 0 · engine 246 (Phase 4 의 221 → **+25**) · socket 22 · flows 24 · web 174
= **466** · lint 0 error · `nx build web` · `yarn engine:demo` green.

### 남은 것

| 항목                                                               | 막힌 이유                                             |
| ------------------------------------------------------------------ | ----------------------------------------------------- |
| `useFlows` → repository 이관                                       | **DEV 자격증명** (스모크 없이는 stale-read 증명 불가) |
| `createWebSocketPort` 미연결 (285줄, `--real` 이 실행 통째로 스킵) | 배선/삭제는 제품 판단                                 |
| agents 포크 `CanvasBinding`                                        | 다른 레포. 이 브랜치 머지 후                          |
