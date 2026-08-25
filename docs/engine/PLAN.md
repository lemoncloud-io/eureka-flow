# PLAN — `@flows/engine` Phase 0–6 실행 계획

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
- `draftStorage.ts`(IndexedDB)는 **이동하지 않는다** — 브라우저 어댑터. ~~Phase 2에서 StoragePort 뒤로 들어간다.~~
  → **StoragePort 는 만들지 않기로 했다 (§13).** 엔진은 `draftFor()` 로 드래프트의 *모양*만
  판단하고 저장은 호스트가 한다. 포트를 두면 엔진 안에 호출자가 없다.

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
- 웹앱 수동 스모크: 로드 → 편집 → dirty 표시 — **Phase 6 이후 실행함, 진행 체크리스트 참조.**
  이 Phase 시점에는 미실행이었다: `apps/web/.env`가 실 DEV 백엔드(`api.eureka.codes/flw-d1`)를
  가리켜 로그인 자격이 필요하고, save가 실제 flow를 건드린다. 대신 확인했던 것:
  `nx build web` green (실 CI 게이트인 prod 빌드), vite dev server에서 `@flows/engine` 및
  소비 모듈 트랜스폼 200/에러 0, jsdom 174 스펙 green —
  **모듈 해석은 3개 모드(prod·dev·test) 전부 검증됨**.

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
- 웹 수동 스모크 — **Phase 6 이후 실행함, 진행 체크리스트 참조.** 이 시점엔 Phase 0과 같은
  이유로 미실행이었다(실 DEV 백엔드 + 로그인 자격).
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

> **결과 (§13).** `SocketPort` 는 Phase 3 에서 만들었다. 나머지 둘은 **쓰이는 Phase 가 오지
> 않았고, 만들지 않기로 했다** — 엔진 안에 그 포트를 부르는 코드가 없다. 근거는 §13.

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

## 진행 체크리스트

이 절만 번호가 없다. 계속 덧붙는 색인이지 장(章)이 아니다 — 한때 `## 9.` 였는데
바로 아래 stale-input 절도 `## 9.` 로 붙는 바람에 §10~§12 상호참조가 한 칸씩 어긋나 있었고,
번호를 뺀 쪽이 나머지를 전부 밀어내는 것보다 싸다.

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
- [x] P5-1 `mergeNodeView` — HTTP wire 디코딩을 `parseSocketFrame` 옆으로 (§10)
- [x] P5-2 `reset-node` — 한 번도 발화한 적 없던 effect, 양쪽 절반 수정 (§10)
- [x] P5-3 `loadGraph` 단일 ingress — 포트 병합·엣지 전파를 엔진으로 (§10)
- [x] **Phase 5 완료 조건 전부 green** — engine 246 (Phase 4의 221 → **+25**), socket 22,
      flows 24, web 174 = 466. `tsc -b --force` **0**, lint 0 error, `nx build web`,
      `yarn engine:demo` green.
- [x] P6-1 블록 레지스트리 키잉 수정 (`$definition.type` + `cores=1&limit=-1`)
- [x] P6-2 `SocketPort.connectionId()` — run 결과가 돌아올 연결을 지정
- [x] P6-3 `--real` 기본 read-only (`--write` / `--run` 명시 필요)
- [x] **Phase 6 완료 조건 전부 green** — 실서버에서 `load → add → undo → redo → save → run`
      완주, 실플로우 6개 로드가 `dirty=false` (불변식 7 실데이터 확인).
      engine 258, socket 22, flows 24, web 174 = **478**.
      `tsc -b --force` **0**, lint 0 error / 53 warning (전부 선행), `nx build web` green.
      측정은 `node node_modules/typescript/bin/tsc` 직접 호출 — `npx tsc` 는 이 환경에서
      래퍼를 타서 `--version` 조차 버전을 안 찍는다.
- [x] `StoragePort` · `LlmPort` — **만들지 않기로 결정 (§13).** DESIGN 이 예고한 포트 5개 중
      둘. "쓰이는 Phase 에서 만든다"고 미뤄둔 채 그 Phase 가 오지 않았고, 엔진 안에 호출자가
      없다. 미완이 아니라 판단으로 닫았다.
- [x] **웹앱 수동 스모크** — Phase 0·2 에서 두 번 미실행으로 남아 있던 유일한 항목.
      실 DEV 플로우(`1007934`, 4노드/2엣지)를 브라우저에서 열어 확인:
      **로드 후 `baseline: yes` / dirty 아님**(불변식 7), **포트 값 병합 + 엣지 전파가
      화면에 도달**(상류 `텍스트 입력` 의 출력이 하류 `미리보기` 두 개에 다 찍힘 —
      Phase 5 의 `loadGraph({ ports })` 단일 ingress 가 브라우저에서 도는 것을 처음 육안 확인),
      편집 시 `dirty` 표시 전환.
      **저장·실행·소켓 갱신은 이번 스모크에서 별도로 확인하지 않았다** — 자동 게이트와
      실서버 헤드리스 런(§11)이 덮는 경로다.
- [x] **npm 배포 패키지 — `@lemoncloud/flow-engine` (§14).** 소스 변경 0.
      `libs/engine` 이 `private` 을 벗고 ESM/CJS 두 벌 + d.ts 를 `build/` 로 낸다.
      **이 절 위쪽 Phase 들의 `nx test engine` 은 그 시점의 기록이다** — nx 프로젝트명이
      패키지명을 따라가므로 지금 도는 명령은 `nx test flow-engine`.
- [ ] agents 포크 `CanvasBinding` — 다른 레포. 이 브랜치 머지 후.

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

---

## 11. Phase 6: 실서버 스모크 — 스텁이 감추고 있던 것들

DEV 자격증명을 받아 `libs/engine` 을 처음으로 **실제 서버**에 붙였다. 유닛 테스트 255개가
green 인 채로 통과하던 코드에서 **세 가지 결함**이 드러났다. 셋 다 원인이 같다:
**스텁이 서버가 아니라 클라이언트 코드에 맞춰 작성돼 있었다.**

### 6-1. 블록 레지스트리가 존재하지 않는 필드로 키잉 (`c691d3b`)

`byType` 이 `block.type` 을 읽었는데 `GET /blocks/0/list` 의 행에는 `type` 이 없다 —
`id`(`0008`), `processType`, 그리고 `$definition`(여기에 노드가 부르는 `type: 'input-text'`).
결과: **11개 블록 전부 `undefined` 키 하나로 붕괴.**

요청도 틀렸다. 앱은 `?cores=1&limit=-1` 로 부른다 — `cores=1` 이 `$definition` 을 펼치고,
limit 없으면 레지스트리가 잘려 일부 노드가 unknown type 이 된다. 엔진은 둘 다 안 보냈다.

**증상은 내내 눈앞에 있었다**: 데모가 `add a **undefined** node` 를 출력하고 있었고,
생성된 노드는 `type: '#undefined'` 로 저장됐다. 읽고도 지나쳤다.

살아남은 이유: 스텁 fixture 가 top-level `type` 을 갖고 있었다 — **서버가 한 번도 보낸 적
없는 shape**. 스텁이 망가진 코드에 동의하니 데모도 repository 스펙도 OK 를 냈다.
스펙 4개 신설 (레지스트리 커버리지가 **0개**였다).

### 6-2. `connection` 없이 run 을 요청 (`b78d291`)

run 은 결과를 스트림 받을 소켓 연결을 지정해야 한다. 브라우저는 어디서든 넘긴다.
헤드리스는 넘길 수 없었다 — `SocketPort` 에 연결 id 를 알릴 방법이 없었다.
서버는 run 을 접수하고 **아무에게도 스트림하지 않았고**, `waitForNode` 가 타임아웃했다.
느린 서버처럼 보이는 실패지만 실은 빠진 인자였다.

서버는 `{ action: 'info', data: { connectionId } }` 로 자기소개를 한다. 어댑터가 거기서
읽는다 — 플로우가 아니라 **소켓에 대한 사실**이고, 재연결하면 새 id 를 받으므로 close 시
버린다. `RunSession` 이 forward (세션만 든 호출자는 port 가 없다).

### 6-3. `--real` 이 기본으로 남의 플로우에 썼다 (`c6cc01c`)

`--run` 은 막았는데 **데모의 step 5 = save** 가 `--real` 에 포함돼 있는 걸 놓쳤다.
실행해보고 알았다 — 실제 DEV 플로우에 노드가 저장됐고, 되돌려야 했다.
이제 `--real` 은 load 에서 멈춘다. `--write` 로 add/save, `--write --run` 으로 실행.
read-only 런은 **자기가 한 것만 주장한다** — 아무것도 안 만든 숫자로 edit 불변식을
검사하면 자동으로 통과한다(추가가 없으면 undo 후 개수가 같은 건 자명하다).

### 실서버로 확인된 것

- **6개 실플로우 헤드리스 로드** — 포트 병합·엣지 전파 완료(undelivered 0), `dirty=false`
  (**불변식 7 이 실데이터에서 성립** — 틀렸으면 모든 플로우가 열자마자 dirty).
- **`createWebSocketPort` 실연결** — 285줄 어댑터가 처음으로 실제로 돌았다.
- **전 구간 완주**: `load → add → undo → redo → save → run`, 노드 COMPLETED,
  run 후 graph clean, 브라우저 없음. (테스트 플로우 `1011132`)

### 서버 관찰 (코드 아님)

- **`DELETE /flows/:id` 를 서버가 거부한다** — `400 INVALID - not supported`.
  서버 `api-flows.ts:787` 의 `doDelete` 가 무조건 throw 한다 (flows 만이 아니라
  blocks·nodes·runs 도 전부 동일 — `api-runs.ts:419` 주석이 "not supported for now" 라고
  적어둔 미구현이다). `libs/flows/src/api/flows.ts:125` 의 `deleteFlow` 가 정확히 이 요청을
  보내므로 **앱의 플로우 삭제가 동작하지 않는다.** 테스트 플로우 `1011132` 도 그래서 못 지웠다
  (`hasOwned: true` 인데도) — 비우고 이름만 표시해뒀으니 콘솔에서 지워야 한다.
  `upsert` 로 `deletedAt` 을 쓰면 200 이 오지만 서버는 `deletedAt: 0` 을 유지한다.

#### 정정 — `channelId` 를 "서버 계약 문제"로 적었던 것

원래 이 자리에 "서버가 `channelId` 를 안 보내서 앱이 기본값 `'0000'` 으로 떨어진다,
CLAUDE.md 와 서버가 불일치한다"고 적었다. **관찰은 맞고 결론이 틀렸다.**

`'0000'` 은 폴백이 아니라 **소켓의 실제 기본 채널 id** 다 — 서버 opening frame 이
`channel$$: [{ name: '#default', id: '0000' }]`, `channels: ['0000']` 을 함께 보낸다.
그리고 실행 프레임은 채널 브로드캐스트가 아니라 **connectionId 로 1:1 전송**된다
(서버: `proxy-graph.ts:275` → `wss-proxy.ts` `publishMessage(connId, …)`).
브라우저는 그 id 를 `useWebSocketWorker.ts:54,166` → `useInitFlowSocket.ts:118` 로 이미
받아 `POST …/run?connection=…` 에 싣고 있고, 헤드리스도 §11-2 이후 같은 경로다.
**양쪽이 같은 메커니즘을 쓰고 있고, 그건 잘 돌아간다.**

남는 사실은 훨씬 작다: `if (flowData.channelId)` 가 발화하지 않아 스토어 필드가
서버 입력 없이 굴러다닌다는 것.

#### 그래서 지웠다 (`5b47fea`)

"죽은 배선" 이라고 적었는데, 읽어보니 **완전히 죽은 건 아니었다.** `createNewFlow` 가
`setChannelId(null)` 을 부르고 되돌릴 writer 가 없으니(유일한 writer 가 서버가 안 보내는
필드를 읽는다) 한 번 새 플로우를 만들면 세션 내내 `null` 이다. 그 상태에서:

- 소켓이 `channels` **없이** 연결된다 — 다른 모든 경로와 다르게.
- `FlowEditorPage` 가 헤더 소켓 상태 표시를 같은 값으로 게이팅하고 있어서,
  **소켓은 붙어 있는데 표시만 사라진다.**

값을 쓰이는 자리(`useInitFlowSocket` 의 `DEFAULT_CHANNEL`)로 내리고 상태를 걷어내니
둘 다 없어진다. 재연결 effect 의 의존성도 `[apiKey]` 로 줄었다 — 연결은 플로우가 아니라
키를 따른다. 순수 삭제가 아니라 **동작 변경**이므로 커밋 메시지에 명시했다.

- **트레일링 슬래시 관찰은 내렸다.** `/flows?…` 와 `/flows/?…` 가 다른 응답을 준 걸 봤지만
  이 레포에서도 서버 레포에서도 재현되지 않는다 — lemon-core
  (`protocol-service.js:607`) 는 빈 id 를 falsy 로 보므로 둘 다 `LIST` → `doList` 여야 한다.
  실제 base 가 `…/flw-d1/_api_/` 라 `_api_` 프리픽스 유무 쪽이었을 가능성이 크다.
  **미확정 관찰을 계약 위반으로 적어둘 근거가 없다.**

### 게이트

`tsc -b --force` 0 · engine **255** · socket 22 · flows 24 · web 174 = **475** ·
lint 0 error · 스텁 데모 green · 실서버 전 구간 green.

### 남은 것

| 항목                         | 상태                         |
| ---------------------------- | ---------------------------- |
| `useFlows` → repository 이관 | **하지 않는다 — §12**        |
| agents 포크 `CanvasBinding`  | 다른 레포. 이 브랜치 머지 후 |

---

## 12. `useFlows` 이관을 하지 않기로 한 이유 (§10 정정)

§10 에서 "엔진이 절반만 채택됐다 — 저장·실행 오케스트레이션은 웹이 옛 경로를 탄다"고
적었다. **틀린 진단이었다.** `useFlows` 를 실제로 읽으면:

| `useFlows` 가 하는 일                                                        | 누가 소유                                          |
| ---------------------------------------------------------------------------- | -------------------------------------------------- |
| `loadFlowById` — TanStack 캐시, canonical id 별칭, 메타데이터 쓰기, 403 처리 | 앱                                                 |
| **그래프 로드**                                                              | `WorkflowCanvas.loadWorkflow` → `engine.loadGraph` |
| **save body 생성**                                                           | `toSnapshot` (엔진)                                |
| **rebaseline**                                                               | `rebaseline` (엔진)                                |
| saveStatus 상태기계, 낙관적 캐시 mutation, draft, retry                      | 앱                                                 |

**규칙은 이미 엔진이 소유하고 있다.** `repository`/`runSession` 은 "채택 안 된 절반"이
아니라 **헤드리스 transport 바인딩** — `useFlows` 의 CLI 대응물이다. 규칙 하나에
바인딩 둘은 의도된 구조이지 중복이 아니다.

이관하면 잃는 것: CLAUDE.md 가 명시한 mutation 규칙(`setQueryData` 로 직접 갱신,
`invalidateQueries` 금지 — 백엔드 eventual consistency)이 전부 `useFlows` 안에 있고
`flowRepository` 에는 쿼리 캐시 개념이 없다. 트랜스포트를 통일해 얻는 것보다 크다.

남아 있던 진짜 격차는 좁았고 그건 채웠다 — `repository.load` 가 받아놓고 버리던
플로우 메타데이터 (`flowInfo()`, `1eb3e8a`).

### 게이트 (Phase 6 최종)

`tsc -b --force` 0 · engine **258** · socket 22 · flows 24 · web 174 = **478** ·
lint 0 error · 스텁 데모 green · 실서버 전 구간 green.

---

## 13. 만들지 않은 포트 2개 — `StoragePort` · `LlmPort` (P0-3 / P2-1 정정)

DESIGN §3.2.6 은 포트 **5개**를 예고했다. 실제로 만든 건 셋이다:

| 포트          | 상태                 | 엔진 안의 호출자                          |
| ------------- | -------------------- | ----------------------------------------- |
| `HttpPort`    | ✅                   | `repository.load/save/runNode`            |
| `AuthPort`    | ✅                   | `fetchHttpPort` 가 엔드포인트 경로를 물음 |
| `SocketPort`  | ✅                   | `runSession` 이 구독                      |
| `StoragePort` | ❌ **만들지 않는다** | —                                         |
| `LlmPort`     | ❌ **만들지 않는다** | —                                         |

P2-1 은 "각각 쓰이는 Phase 에서 만든다" 고 적었는데, **쓰이는 Phase 가 오지 않았다.**
그대로 두면 미완으로 읽히므로 판단으로 닫는다.

### 판정 기준: 엔진이 그 포트로 손을 뻗는 코드가 있는가

포트는 **엔진 안에 호출자가 있을 때만** 의미가 있다. 위 표의 오른쪽 칸이 비면 그것은
추상화가 아니라 아무도 부르지 않는 인터페이스다 — CLAUDE.md 가 금지하는 speculative
abstraction 이 뒤늦게 생기는 경로.

### 13-1. `StoragePort` — 저장은 방향이 반대다

§3 P0-3 이 이렇게 적어뒀다:

> `draftStorage.ts`(IndexedDB)는 **이동하지 않는다** — 브라우저 어댑터. **Phase 2에서
> StoragePort 뒤로 들어간다.**

Phase 2 는 완료로 표시됐고, `grep StoragePort` 는 **0건**이다.

저장은 HTTP·소켓과 방향이 반대다:

```
engine/persistence/draft.ts   draftFor(graph, ctx)   ← 순수. "드래프트가 어떤 모양이어야 하나"만 판단
                                    │ 반환
                                    ▼
apps/web/…/useDraftPersistence.ts   draftFor() → writeDraft() / clearDraft()
apps/web/…/useDraftRecovery.ts      readDraft() → draftHasUnsavedWork() → baselineForRecovery()
```

**엔진은 아무것도 저장하지 않는다** — `libs/engine/src/repository/` 와 `engine.ts` 에
`draft` 문자열이 0건이다. 호스트가 판단만 꺼내 가서 자기 저장소에 넣는다.

`StoragePort` 를 만들면 **엔진 안에 구현체를 부르는 코드가 한 줄도 없는 인터페이스**가 된다.
그리고 그걸 부르게 하려면 엔진이 "언제 써야 하나" 를 알아야 한다 — 디바운스, 실행 중 제외,
저장 성공 후 clear, 구조 드랍 시 유지. 그건 전부 앱의 수명주기 지식이고, §12 에서
`useFlows` 를 이관하지 않기로 한 것과 **같은 이유로** 엔진에 두지 않는다.

이식성도 이 모양이 더 낫다. 포트였다면 각 런타임이 구현체를 만들어야 한다. 지금은
`draftFor()` 가 돌려주는 평범한 객체를 어디에 넣든 호스트 자유다 — 브라우저는
IndexedDB(base64 이미지가 localStorage 5MB 쿼터를 넘기므로), RN 은 MMKV, Node 는 파일.
**엔진이 저장소를 하나도 몰라도 된다는 게 제약이 아니라 결과물이다.**

### 13-2. `LlmPort` — 엔진은 모델을 부르지 않는다

DESIGN 은 `LlmPort(= LlmGateway)` 를 예고했지만, 실행 모델을 보면 엔진이 그 자리에 설 일이 없다:

| 블록                | 누가 실행                                                                              |
| ------------------- | -------------------------------------------------------------------------------------- |
| `isFrontend: true`  | 앱의 `EXECUTE_FUNCTIONS` (`libs/flows/src/api/execute-functions.ts`) — 브라우저 안에서 |
| `isFrontend: false` | **서버.** 클라는 `POST /nodes/:id/run` 만 치고 결과를 소켓으로 받는다                  |

엔진의 `repository.runNode` 는 후자 하나뿐이고, 그건 이미 `HttpPort` 다.
`grep -iE "openai|anthropic|gemini"` 는 엔진 소스에 **0건**(스텁 fixture 의 블록 타입 문자열
`process-llm` 제외). 프론트엔드 실행 경로는 앱 소유이고 §12 에서 `useFlows` 를 남긴 것과
같은 이유로 그대로 둔다 — 모델 키·요금·프로바이더 설정은 전부 앱·서버 관심사다.

엔진이 직접 모델을 부를 일이 생긴다면 (예: 헤드리스 CLI 가 프론트엔드 블록까지 실행) 그때
호출자와 함께 만든다. 지금 만들면 구현체를 아무도 안 부른다.

### 남는 것

`docs/engine/GUIDE.md` 의 "IndexedDB 는 엔진에 없다 — 어디에 넣을지는 호스트가 정한다" 는
서술은 이제 근거가 있다. 이 절이 그 근거다 — 그 전까지는 **결정이 아니라 사후 정당화**였다.

---

## 14. npm 배포 — `@lemoncloud/flow-engine`

엔진 소스는 **한 줄도 안 바뀐다.** `libs/engine` 이 `private` 을 벗고 빌드 산출물을 내는 것,
그게 전부다. 목적은 하나: CommonJS 소비자(flow-mcp)가 `require()` 로 엔진 규칙을 쓰는 것.

### 확인하고 시작한 것

| 사실                                                          | 근거                                            |
| ------------------------------------------------------------- | ----------------------------------------------- |
| 런타임 의존성 0 — flows-api 참조는 **전부 `import type`**     | `grep -v "import type"` → 0건                   |
| `import.meta` / `node:` builtin / `require(` 없음 → dual 안전 | 엔진 소스 grep 전부 0건                         |
| `process.*` 는 `cli/main.ts` 하나, 배럴에서 export 안 함      | grep + `index.ts`                               |
| `src/types.ts:116` 이 외부 모듈을 **augment** 한다            | `declare module '@lemoncloud/eureka-flows-api'` |

마지막 줄이 빌드 방식을 정했다.

### 왜 tsup 이 아니라 tsc + esbuild 인가

d.ts 를 **평탄화(flatten)하는 것이 augmentation 을 떨어뜨리는 바로 그 연산**이다 —
`declare module '<외부 패키지>'` 는 export 그래프에 없으므로 번들러가 도달하지 못한다.
떨어지면 소비자 쪽에서 `NodeData.state` 가 조용히 사라진다.

그래서 **선언은 `tsc` 가 파일별로** 낸다(구조상 유실 불가), **JS 두 벌은 `esbuild`** 가 낸다.
esbuild 는 이미 `engine:demo` 가 직접 부르고 있어서 **새 의존성이 0개**다.
tsup 을 넣었으면 의존성 하나와 "augmentation 이 살아남는가"라는 검증 항목이 같이 늘었다.

> 대가: `esbuild` 는 루트 `devDependencies` 에 **선언돼 있지 않다**(vite 의 전이 의존성).
> `engine:demo` 가 이미 같은 자세라 맞췄다. 깨지면 `command not found` 로 크게 깨진다.

### 왜 `dist/` 가 아니라 `build/` 인가

`libs/engine/dist` 는 이미 `tsc -b` 것이다 — 워크스페이스 `rootDir: "."` 때문에
`dist/libs/engine/…` 로 중첩되고 tsbuildinfo 를 갖는다. 여기에 패키지 빌드를 얹으면
① `prepack` 의 clean 이 `tsc -b` 가 거기 두는 tsbuildinfo 를 지우고
② `files: ["dist"]` 가 tsc 산출물까지 타르볼에 담는다.

②는 확인했다(`npm pack --dry-run` 파일 목록). ①은 메커니즘까지만 — 증분 캐시가 실제로
얼마나 다시 도는지는 재보지 않았다. 어느 쪽이든 두 빌드가 한 디렉터리를 나눠 쓸 이유가 없다.

`build/` 는 `.gitignore` 가 이미 덮고 있어 새 무시 규칙도 필요 없었다.
대신 eslint 의 ignores 에는 `dist` 만 있고 `build` 가 없어서 생성된 번들을 린트했다 —
esbuild 가 낸 `var` 를 두고 `no-var` 201 error. `eslint.config.mjs` 에 한 항목 추가로 해결.

### 중첩 `build/package.json` — 이게 없으면 타입이 통째로 사라진다

패키지 루트가 `"type": "module"` 이므로 `build/index.d.ts` 도 ESM 으로 읽힌다. 그러면
`export * from './core'` 같은 **확장자 없는 상대 경로가 `moduleResolution: nodenext` 에서
해석 불가**가 된다. 소스에 `.js` 확장자를 박는 것 말고는 tsc 로 고칠 방법이 없다.

그래서 `prepack` 이 `build/package.json` = `{"type":"commonjs"}` 를 같이 낸다.
`.mjs` 는 확장자가 이겨서 그대로 ESM 이고, d.ts 만 CJS 로 읽혀 확장자 없는 재export 가 합법이 된다.

**되돌려서 확인했다** — 이 파일을 지우면 `nodenext` 소비자에서:

```
t.ts(1,10): error TS2305: Module '"@lemoncloud/flow-engine"' has no exported member 'mergeNodeView'.
t.ts(2,15): error TS2305: Module '"@lemoncloud/flow-engine"' has no exported member 'GraphNode'.
```

멤버가 **하나도 안 보인다**. 복구하면 exit 0.

### 게이트

| 무엇                                                   | 결과                                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| **CJS 진입점에서 실제 트랜잭션**                       | add → undo → redo 통과, 주입한 id 그대로 (`build/index.cjs` 로드 확인)      |
| **ESM 진입점에서 같은 트랜잭션**                       | 동일 결과 (`build/index.mjs` 로드 확인)                                     |
| `tsc --noEmit -p .` · `module: commonjs` (node10 해석) | green                                                                       |
| `tsc --noEmit -p .` · `moduleResolution: nodenext`     | green                                                                       |
| `npm pack` 내용                                        | `build/**` + package.json/README/LICENSE, 41개. `cli/` 없음, `process.` 0건 |
| 레포 게이트 (tsc·508 스펙·lint·demo·web build)         | 배포 전과 **전부 동일**                                                     |

첫 두 줄이 핵심이다. `typeof m.parseSocketFrame === 'function'` 은 **배럴이 이름을
재export 했다**는 것밖에 증명하지 않는다 — 포장 경계를 넘어 엔진 코드가 실제로 도는지는
트랜잭션을 하나 돌려봐야 안다. 주입한 uuid 가 `naaaaaaaabbbb…` 로 나오는 것이
`configureIds` 와 대시 제거까지 번들 안에서 살아 있다는 증거다.

타입 게이트는 **`skipLibCheck: true` 기준**이다. 끄면 에러가 나오는데 전부 `node_modules`
안이다 — `@lemoncloud/eureka-flows-api` 의 `views.d.ts` 가 자기 의존성에 없는
`@lemoncloud/eureka-agents-api` 를 참조하고, `lemon-model` 의 인덱스 시그니처가 TS2411 을 낸다.
**우리 d.ts 에서 나온 에러는 0건**이고, 이 레포도 `skipLibCheck: true` 로 돈다.
상류 패키지 문제라 여기서 고칠 수 없다.

> 게이트 3 은 플랜 원문의 `tsc --noEmit t.ts` 를 **`-p .` 로 바꿔서** 돌렸다. 파일을
> 커맨드라인에 주면 tsconfig 를 통째로 무시해서 검증하려던 node10 해석이 안 걸린다.
> 그리고 `mergeNodeView({}, {})` 만으로는 augmentation 을 안 건드리므로
> `GraphNode.state` 를 읽는 줄을 넣었다 — 체크 항목과 게이트가 같은 걸 보게.

### 감수한 것

- **`yarn install` 이 경고 2줄을 찍는다** — `Workspaces can only be enabled in private projects.`
  `private` 을 되돌려 0줄임을 확인했으니 원인은 확실하다. yarn 1 은 워크스페이스 자식이
  private 이길 바라지만, `npm publish` 는 private 을 거부한다. 심링크·`--frozen-lockfile`
  둘 다 정상이라 경고만 남는다.
- **레포 안 import 는 `@flows/engine` 그대로.** 별칭과 배포명이 달라도 문제 없고,
  200곳 넘는 import 를 바꾸는 값이 이득보다 크다.
- **nx 프로젝트명이 `@lemoncloud/flow-engine`** 으로 따라 바뀌었다 → 짧은 이름은
  `engine` 이 아니라 `flow-engine`. 이름을 유지하려고 `project.json` 을 넣는 대신
  이름 하나만 쓰기로 했다.
- **`sideEffects: false` 는 뺐다** (플랜 원문에는 있었다). 한 파일로 번들된 패키지라
  얻는 게 거의 없는데, `core/ids.ts` 가 프로세스 단위 레지스트리를 모듈 변수로 들고 있다.
  그 모듈이 든 패키지를 두고 "부작용 없음"이라고 선언할 이유가 없다.
- `npm publish` 는 실행하지 않았다 — 계정 소유자 몫.

### 플랜 체크리스트와 다른 점 — 셋 다 승인 후 유지

리뷰가 Axis B 로 잡아 사용자 게이트에 올린 항목들. 되돌리지 않고 유지하기로 확정했다.

| 플랜 체크리스트 원문                           | 실제                                       | 왜                                                                                                                     |
| ---------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| "tsup 설정"                                    | tsup 미설치. `tsc`(d.ts) + `esbuild`(번들) | 평탄화가 augmentation 을 떨어뜨린다. per-file emit 은 구조상 유실 불가, 새 의존성 0                                    |
| "`dist/{index.mjs,index.cjs,index.d.ts}` 생성" | `build/`                                   | `dist/` 는 이미 `tsc -b` 소유 (tsbuildinfo + `files` 오염)                                                             |
| "정본 3개 유지, 새 문서 만들지 않음"           | `libs/engine/README.md` + `LICENSE` 추가   | 배포 산출물이지 4번째 설계 정본이 아니다. 없으면 npm 페이지가 빈 채로 나가고, Apache-2.0 §4(a) 는 사본 동봉을 요구한다 |

세 번째는 `GUIDE.md` "더 볼 곳" 에도 한 줄 올려서 문서 지도가 4개를 다 가리키게 했다.

---

## 15. 모바일 에디터를 엔진으로 (별도 브랜치 `feature/mobile-engine`)

§14 까지가 `docs/flow-engine` 이다. 이 절은 그 브랜치에서 분기한 **별도 PR** 의 기록이고,
`docs/flow-engine` 이 먼저 머지되는 것을 전제한다.

### 왜 — 조사에서 간극이 예상보다 좁았다

모바일은 "엔진 이전 아키텍처" 가 아니었다. 규칙은 이미 공유하고 있었다: 사이클 차단·포트 타입
호환(`wouldCreateCycle`·`arePortTypesCompatible`), id 민팅, 실행 입력 hydrate(§9 수정 포함),
그리고 save 는 `useFlows.ts:248` 의 `toSnapshot` 을 탄다 — **런타임 상태가 save body 로 안 샌다.**

> 처음에 "모바일 save 에 런타임 상태가 샌다" 를 의심했는데 **틀렸다.** `transformNodeForSave`
> 가 slim 노드를 새로 조립하고 `inputData`/`outputData` 를 아예 안 복사한다.

빠진 건 둘이었다.

**① 로드 시 포트 병합·엣지 전파 부재 — 유일한 실기능 결함.** 포트 값은 노드 안이 아니라
응답의 별도 `ports` 배열로 오고(`core/ingress.ts`), 모바일의 로드 4곳은 전부
`useCanvasStore.loadWorkflow` — **`ports` 인자가 없는 함수**였다. 저장도 런타임을 안 실으므로
어디서도 메워지지 않았다: 플로우를 열면 지난 실행 데이터가 **없었다**(문서 값만 나온 게 아니라).

**② history 부재 + 런타임/편집 미구분.** 소켓 상태도 config 편집도 같은 `updateNodeData`.

### 무엇을 했나

| 슬라이스 | 무엇                                                                               |
| -------- | ---------------------------------------------------------------------------------- |
| 01       | 엔진 인스턴스 + `useEngineMirror` + 로드 4곳 → `loadFlowIntoEngine`. 스펙 5개 신설 |
| 02       | write 14사이트 → 편집 `transact` / 런타임 `applyRuntime`. 순 −20줄                 |
| 03       | 이 절 + README·GUIDE·CLAUDE 의 "모바일은 엔진 안 씀" 철회                          |

**02 는 안 쪼갰다.** 미러가 알림마다 스토어를 통째로 덮으므로, 편집만 먼저 옮기면 편집 알림이
아직 스토어에 직접 쓰이던 런타임 상태를 지우고, 런타임만 먼저 옮기면 추가된 노드·config 를
지운다(후자가 더 나쁨 — 표시가 아니라 데이터).

### 계획이 놓쳤던 것 3개

1. **노드 삭제가 훅이 아니라 컴포넌트 2곳에 있었다** (`MobileStepList`, `MobileStepDetail`).
2. **`MobileTutorialPage` 가 `useConnectionMode`·`MobileStepList` 를 공유한다.** 두 훅이 엔진을
   요구하자 컴파일이 깨졌다. 튜토리얼에도 엔진을 줬다 — 레지스트리를 넘기는 것까지. 안 넘기면
   `connect` 가 `INCOMPATIBLE_PORTS` 를 영원히 안 던지는데, 튜토리얼이야말로 잘못된 연결을
   일부러 시도해 보는 화면이다.
3. **`applyRuntime` 은 shallow 교체다.** 데스크톱이 연결 시
   `{ inputData: { [port]: packet } }` 를 그냥 넘기는 건 **방금 만든 노드**라 안전한 것이고,
   모바일은 기존 노드에 연결하므로 병합하지 않으면 **형제 입력 포트가 날아간다.**

### 연결의 원자성

입력 포트는 1:1 이라 기존 엣지를 끊고 새로 잇는데 `ops.connect` 는 사이클·중복·타입 불일치를
**throw** 한다. 한 `transact` 안에 넣어 거절 시 끊기까지 롤백된다 — 둘로 나누면 포트가 아무
엣지도 없는 상태로 남는다.

### 확인한 것 / 안 한 것

green: `tsc -b --force` 0 · engine 288 · socket 22 · flows 24 · web 179 = **513** ·
lint 0 error / 51 warning · `nx build web`. 완료 판정은 grep — 모바일·튜토리얼 코드에
`setNodes`/`updateNodeData`/`deleteNode`/`loadWorkflow` 등 **0건**.

**안 한 것:**

- **모바일 수동 스모크 미실행.** 특히 "실행 중 소켓 상태가 반영되면서 그 사이 편집이 안
  지워지는가" — 슬라이스 02 의 리스크가 겨냥한 바로 그 경로가 자동 게이트 밖이다.
- **undo/redo UI 없음.** 엔진이 생겨 _가능해졌을 뿐_, 버튼·제스처는 UX 결정이라 별건.
- **데스크톱의 지연 fetch 는 모바일에 여전히 없다.** 데스크톱은 서버가 `undefined` 로 남긴
  포트 행을 로드 뒤 따로 가져와 다시 전파한다(`WorkflowCanvas.tsx` ~690-730). 이 전환은
  `loadGraph` 호출부만 맞췄고 그 후속은 안 옮겼다.
- 신규 스펙은 슬라이스 01 의 5개뿐. 02 는 동작 보존이 목표인 재배선이라 red-green 신호가
  없다고 보고 안 썼다 — **disconnect+connect 원자 롤백만은 실제로 안 덮인다.**

## 16. 노드 state 갭 — 목록이 아니라 fallback 이 문제였다 (`docs/engine-node-state`)

배경 자료 2개가 이 절의 근거다. `node-state-model.md` = 지금 사실이 어떤지,
`PLAN-node-state-completion.md` = 슬라이스 큐와 각 슬라이스의 판정.

### 무엇이 문제였나

서버 계약(`NodeStatusType`)은 멤버 8개를 선언하고 엔진 유니온은 5개다. 목록 차이로 보였고,
그래서 처음 세운 플랜은 "유니온을 넓힌다"였다. **틀린 진단이었다.** 목록은 증상이고,
같은 원인의 fallback 셋이 각각 조용히 틀리고 있었다.

### S0 — 와이어가 진짜 뭘 싣는가 (판정: 안 싣는다, 다만 지워진 기능)

서버 소스 레포(`eureka-flows-api` `develop@1efa791`)를 직접 읽었다. 소켓 노드 프레임을 만드는
곳은 `transformer-graph.ts:1546` `asSocketNodeEvent` 하나뿐이고, state 는 5분기 삼항이 전부라
와이어 어휘는 `{READY, RUNNING, COMPLETED, ERROR}`. `''`는 `stage === null` 이 필요한데
`RunNodeStage` 에 `null` 이 없어 도달 불가. **엔진 유니온 5개가 오늘 와이어와 정확히 일치한다** —
갭은 "선언 8 vs 도달가능 5"다.

그런데 `SKIPPED` 는 한때 실렸다. `disabled` 노드를 그렇게 마킹했고, `b2093a9`
"v0.26.227a cleanup"(2026-02-28)이 proxy → proxy-graph 이행 중 `disabled` 처리째로 지웠다.
**예약어가 아니라 회귀한 기능이다.** 그래서 유니온 확장(S2)은 취소가 아니라 **보류** —
취소하면 기능이 돌아올 때 같은 조사를 다시 한다. 착수 조건 2개를 배경 문서에 적어뒀다.

이 판정이 뒤집은 것 하나: flow-mcp 의 `RANK_AS`/`TERMINAL_STATES` 는 죽은 보정이 아니라
**예약된 계약에 대한 방어**다. 원래 "엔진이 규칙을 가지면 지운다" 목록이었는데 유지 목록이 됐다.

### S1 — 고친 것 (`ef04806`)

1. **`shouldUpdateState` 의 `-1` 센티넬.** 랭크 못 하는 state 를 `-1` 로 두면 한 값이
   동시에 들어올 수도 없고(`-1 >= 2`) 지켜지지도 않는(`x >= -1`) 상태가 된다. 이제 랭크
   불가면 last-write — flow-mcp 가 밖에서 하던 걸 안으로 들였다. 랭크 판정은 `in` 이 아니라
   `isNodeState` 로 한다(`in` 은 프로토타입 체인을 타서 `'toString'` 이 랭크로 통과했다).
2. **`statePatch(undefined)` 가 노드 state 를 지우고 있었다.** `{ state, status: state }` 는
   값이 `undefined` 여도 **키를 만들고**, `applyRuntime` 은 얕은 병합이라 그 키가 노드 것을
   덮는다. 파서가 state 를 떨군 프레임이 정확히 그 모양이므로, **엔진이 모르는 state 는
   무시되는 게 아니라 노드를 비웠다.** `executionStats` 도 같은 구조였다.
3. **`runSession` 에 우선순위 가드가 없었다.** 리듀서의 Rule 1 은 high-water mark 를 프레임
   자신의 id 에 거는데 포트 프레임은 state 를 **부모**에 쓴다 — 커서 둘에 타깃 하나라 서로를
   정렬하지 못하고, 늦은 포트 프레임이 COMPLETED 를 되돌렸다. 가드 권위는 그래프가 아니라
   **세션이 쓴 것**이다(`written` 맵). `reset()` 이 그걸 비우므로 "리셋하면 이전 run 의 state 는
   더는 기준이 아니다"가 유지된다 — 그래프에서 읽는 첫 구현은 기존 리셋 테스트가 잡았다.
4. **`getEffectiveState` 가 `isNodeState` 에 위임.** 두 번째 화이트리스트(`VALID_STATES`)를
   지웠다. 오늘 기준 **완전한 no-op** 이고(옛 Set 으로 되돌려도 새 스펙이 green), 그 테스트는
   동작이 아니라 **두 목록이 갈라지는 것**을 잡는 드리프트 가드다.

2번과 3번은 플랜에 없었다 — S1 을 구현하다 나왔고, 같은 원인의 다른 얼굴이라 같은 슬라이스에
넣었다.

**게이트**: engine 302(288+14) · flows 26 · socket 22 · web 199 · `tsc -b --force` exit 0 ·
lint 0 error / 55 warning · `nx build web` green. **수정 4개를 각각 되돌려 red 확인.**

### S3 — 기록한 곳

- `libs/engine/src/types.ts` — `@note ... also includes` 한 줄이 결정 기록으로 바뀌었다:
  왜 5개인지, `SKIPPED` 가 왜 예약어가 아닌지, 모르는 state 가 어떻게 처리되는지
- `GUIDE.md` / `GUIDE.ko.md` — **`shouldUpdateState` 언급이 0건이었다.** npm 소비자에게
  세션이 뭘 보장하고, 소켓 밖에서 state 를 쓸 때 뭘 직접 해야 하는지(가드 호출 + 키 생략)를
  적었다. 둘 다 고쳤다
- `node-state-model.md` §2 에 "이 절은 배포물 0.1.0 기준" 단서 — 소스가 S1 에서 달라졌다

### 안 한 것 / 남은 것

- **S2 · S2b · S4 보류.** 유니온 확장, 터미널 계약(`isTerminal` 이 `COMPLETED|ERROR` 둘로
  박혀 있어 SKIPPED 노드는 `waitForNode` 를 안 깨운다), 그리고 배포. 착수 조건은 배경 문서
- **S1 자체의 semver 판단이 남았다.** 배포된 `shouldUpdateState` 의 관찰 가능한 동작이
  바뀌었다(랭크 불가 state 에서 false → true). flow-mcp 는 영향 없다 — `acceptsState` 가
  `RANKED_STATES` 검사에서 먼저 빠져나가 엔진 함수를 아예 안 부른다
- **모바일은 리듀서를 아예 안 탄다.** `useMobileSocketSync` 에 `reduceNodeEvent`·시퀀스 커서·
  `shouldUpdateState` 0건, `if (state) applyRuntime` 손코딩이 전부다. 미모델링 state 는
  `dispatchSocketFrame` 이 엔진 파서를 쓰는 덕에 데스크톱과 똑같이 걸러지지만 **순서 규칙은
  하나도 없다.** S1 가드가 안 닿는다(붙일 자리가 없다) — 모바일을 리듀서 위로 올리는 게
  맞는 수정이고 별 슬라이스다
- **프로덕션 배포 버전 미확인.** 로컬 develop 0.26.621d, 이 레포가 설치한 타입 패키지
  0.26.609. S2 착수 전에는 실측으로 한 번 확인할 것
