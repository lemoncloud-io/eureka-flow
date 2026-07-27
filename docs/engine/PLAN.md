# PLAN — `@flows/engine` Phase 0–1 실행 계획

> 배경/아키텍처/근거는 [DESIGN.md](./DESIGN.md). 이 문서는 **실행 명세**다.
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

- `WorkflowCanvas.tsx`에서 `pastRef`/`futureRef`/`clipboard` useState **삭제됨**
- 편집 경로에서 `setNodes`/`setConnections` 직접 호출 0건 (읽기/미러는 허용)
- vitest `environment: 'node'`에서 engine 스펙 전체 green — **이것이 이식성의 조기 증명이다** (jsdom 아님)
- 웹 수동 스모크: 추가/삭제/연결/드래그/undo/redo/복붙(엣지 포함 확인)/저장/소켓 실행 반영이 기존과 동등

### 명시적 스펙 변경 (1건)

- 복사/붙여넣기가 선택 집합 **내부 엣지를 포함**하게 된다. 기존: 노드만. 의도된 개선이며 되돌리지 말 것.

---

## 5. Phase 2+ (예고만 — 별도 PLAN으로)

- Repository(`load`/`save`/blocks) + HttpPort/AuthPort → **Node CLI 데모** (`load → edit → undo → save`)가 완료 조건
- SocketPort (browser Worker 어댑터 / node `ws`)
- agents 포크의 `CanvasBinding`을 엔진 기반으로 재구현 + 툴 확장 (add/connect/...)

## 6. 진행 체크리스트

- [x] P0-1 lib 스캐폴딩 (`@flows/engine`)
- [x] P0-2 파일 이동 + shim
- [x] P0-3 스토어 결합 제거 (baseline/draft/runGate)
- [x] P0-4 이식 검증 테스트
- [x] Phase 0 완료 조건 — `nx test engine` / `nx test flows` / `nx test web` / `yarn lint` / `nx build web` green.
      `tsc -b`는 **HEAD에서 이미 red** (1200 errors, 새 root-cause 0건), 웹앱 수동 스모크는 미실행: §3 참조.
- [ ] P1-1 코어 (document/ops/history/clipboard/engine)
- [ ] P1-2 미러 모드 바인딩
- [ ] P1-3 WorkflowCanvas 치환
- [ ] P1-4 코어 테스트
- [ ] Phase 1 완료 조건 전부 green
