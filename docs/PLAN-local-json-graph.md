# PLAN — 로컬 JSON 그래프(워크트리) 전환

> 대상: `eureka-flow` 프론트엔드. 근거 문서: `docs/REQUIREMENTS-local-json-graph.md`
> 이 계획은 요구사항 문서 + 코드 정찰(2026-07-17) 결과로 작성. 정찰이 문서 전제 일부를 정정했다 — §1 참조.
> 브랜치: `feature/louis-update-worktree`

---

## 1. 요구사항 문서 정정 (정찰로 확인)

| #   | 문서 주장                                                       | 실제                                                                                                                                                                                                                        | 영향                                                                                                 |
| --- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| C1  | §3 표: `useCanvasHistory.ts` = undo/redo, "유지하되 재정의"     | **소비자 0개인 죽은 파일.** 실제 undo/redo는 `WorkflowCanvas.tsx:405-442`의 인라인 중복. `useCanvasEngine.ts`/`useCanvasLayout.ts`도 같이 죽어있음 (서로만 import)                                                          | R8 재조준                                                                                            |
| C2  | §6: "mobile editor도 같은 hooks를 쓰므로 동일하게 마이그레이션" | 절반만 맞음. 모바일은 `useFlows` 프리미티브만 공유. boot/autosave/socket/serialize/actions/권한파생/`lastSavedStateRef` **전부 자기 복사본**                                                                                | R3/R4/R6를 **공유 층**(`useFlows` + 새 `workspace/`)에 넣으면 양쪽 커버. 페이지 층에 넣으면 2번 작업 |
| C3  | §3: 부팅 시 즉시 `POST /flows/0/save`                           | **조건부**. localStorage 비어있는 새 브라우저가 `/editor` 진입, 또는 저장된 id 로드 실패 시에만 (`useFlows.ts:122-138`)                                                                                                     | R4 유효, 서술만 정정                                                                                 |
| C4  | §6: 3초 self-echo 디바운스                                      | `useSocketHandlers` 아님. `libs/socket/src/hooks/useInitFlowSocket.ts:494`. **`FlowUpdateMessage`에만** 적용 — 노드/포트 메시지는 명시적 예외(`:512-515`)                                                                   | R3/WS 정책                                                                                           |
| C5  | §3: `useNodeSync` 전체 제거                                     | `getSyncedConfig`가 남음. upsert 성공 핸들러만 `syncedConfigRef`를 채움 → upsert 삭제 시 항상 `undefined` → `buildRunBody`가 항상 `{}` → `runNode`에 config 미전달. **R5-a(실행 전 save)가 이걸 메움**                      | R2↔R5 결합                                                                                          |
| C6  | R7: "대용량 S3 오프로드"                                        | **이미지 전용 읽기측 해결**. 서버가 `s3://` ref를 주면 클라가 렌더 시 resolve. 클라측 크기 임계 오프로드 없음                                                                                                               | R7 범위 축소                                                                                         |
| C7  | §2: `#`-prefix id = 삭제 마커로 스킵                            | **DB 쓰기만 스킵. 결과에서 안 걸러져 `nodeIds$$`에 툼스톤으로 들어감** — 삭제 안 일어남                                                                                                                                     | 삭제는 "save 목록 누락"으로만. `#` 방식 폐기 확정                                                    |
| C8  | §2: save가 멤버십 전체 교체                                     | **`body.nodes`가 배열로 존재할 때만** (`flow-save-use-cases.ts:52-60`). `nodes` 생략 시 멤버십 무변경                                                                                                                       | 노드 0개여도 `nodes: []` 필수                                                                        |
| C9  | §2: `deletedAt` 존재 → 에러                                     | 노드 upsert 직행 경로엔 **검사 없음**. soft-delete된 id 재전송 시 조용히 부활                                                                                                                                               | 위험 낮음, 기록만                                                                                    |
| C10 | §2: `-` 회피는 "일관성을 위해"                                  | **실제 키 충돌 위험.** `asKey$`(`proxy-storage-service.js:39-46`)가 DynamoDB `_id` 생성 시 `:`→`-` 치환. 포트는 노드와 같은 `type='node'` 키스페이스(`nodeId:portId`) → 포트 `X:out`과 노드 `X-out`이 **같은 `_id`로 충돌** | ID 생성기가 `-` 절대 금지. `crypto.randomUUID()` 그대로 사용 불가                                    |
| C11 | §2/R5-b: editor 구조 편집 유실                                  | 사실이나 **localhost 예외 존재**: `flow-save-use-cases.ts:38` `const isLocal = proxy.context?.domain === 'localhost'` → 로컬에선 editor save도 구조까지 정상 저장                                                           | **R5-b는 로컬에서 재현 불가.** DEV 배포로만 검증                                                     |

### 서버 검증 결과 (D1 게이트)

**통과.** 클라 생성 ID가 canonical로 살아남는다.

- `proxy-graph.ts:1315-1319`: `const node = _id ? await this.get(_id, $def) : await this.nextNode(...)` — `get`은 create-on-miss(`lemon-core prepare()`), id를 **verbatim** 저장.
- 검증 스펙 존재: `flow-save-use-cases.spec.ts:80-89` — `n01`/`n02`/`e01` 전송 → `nodeIds$$: ['n01','n02']` 저장 확인.
- 노드 id에 **charset/길이/숫자 검증 전무**. `nextId`는 원자적 카운터(`nextSeq`) → ULID 행이 시퀀스 오염 불가.
- 리포 샘플이 이미 클라 id 사용: `sample/save-flow.json` → `vu7lcgp8v`, `gyc10nrwb`.
- 서버 시퀀스는 현재 `10000`부터 (`service-graph.ts:125`), 문서의 `1000077`은 레거시 기본값.

**금지 문자 확정**: `:`(포트 참조 + asKey$ 충돌), `-`(asKey$ 충돌), `@`(run 참조 `id.split('@',2)`), 선두 `#`(쓰기 스킵). → **`[0-9a-z]`만 사용.**

---

## 2. 설계 결정

### D-A. ID 생성기 → **무의존성 hex** ✅ 확정 (2026-07-17)

- 형식: `n` + `crypto.randomUUID().replace(/-/g, '')` = 33자 `[0-9a-f]`. 엣지는 `e` + 동일.
- **대시 제거 필수** — 남기면 C10의 `asKey$` 키 충돌. 요구사항 §2가 "ULID 또는 **동등한 충돌-안전 생성기**"로 열어둔 범위 안.
- `[0-9a-f]`만 → 금지문자(`:`/`-`/`@`/선두 `#`) 전부 회피. 숫자로 시작 안 함 → 서버 시퀀스와 충돌 불가.
- 기존 `isTempId` 프리픽스(`temp_`/`edge_`/`node_`)와 안 겹침(언더스코어 없음) → 혼재 안전.
- 신규 의존성 0. `crypto.randomUUID()` 선례: `ProcessEditorPage.tsx:22`.
- 포기한 것: 시간 정렬성(ULID). 요구사항이 요구하지 않음.
- 엔트로피: UUIDv4 = 122비트 랜덤 → 충돌 무시 가능.

### D-B. `diff()`는 **영속 필드만** 비교 — 런타임 상태 무시

**근거**: 현재 `serializeWorkflowState`(`FlowEditorPage.tsx:46-47`)는 `getWorkflow()` 결과 통짜 비교 = `status`/`inputData`/`outputData`/`executionStats` 포함. 소켓이 `updateNodeFromServer`로 상태를 바꾸면 dirty가 된다.
**이걸 그대로 두면 R5-a가 무한루프**: 실행 → 상태 변경 → dirty → "저장하고 실행?" → 저장 → 실행 → …

`diff()` 비교 대상 = `transformNodesForSave`가 남기는 것과 일치시킨다:
`{ id, type, blockId, position, width, height, customLabel, description, config }` + edges.

### D-C. editor 재베이스라인 → **(a) 서버 재로드** ✅ 확정 (2026-07-17)

`baseline ← working`은 **owner에서만** 옳다. editor(비소유자)는 서버가 config만 저장하고 구조를 버리므로, 노드 추가 → save 200 → `baseline←working` → `isDirty=false` → 리로드 시 노드 증발.

| 안                 | 동작                                                    | 대가                                                                               |
| ------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| (a) 서버 재로드    | save 후 `loadFlow` 재호출 → 서버 진실로 baseline 재설정 | 왕복 1회 추가. `loadWorkflow`가 undo 히스토리를 지움(`WorkflowCanvas.tsx:813-814`) |
| (b) 로컬 병합      | `baseline ← {구조: 이전 baseline, config: working}`     | 왕복 없음. 서버 병합 규칙을 클라가 복제 → drift 위험                               |
| (c) 구조 편집 차단 | editor의 `canModifyCanvas`를 false로                    | `ROLE_PERMISSIONS` 변경 = 제품 정책 변경. ADR 0002 위반                            |

**확정: (a)** — 서버가 진실이고 클라가 병합 규칙을 복제하지 않는다. 왕복 비용은 editor save에만 발생.
S6 구현 시 주의: `loadWorkflow`가 undo 히스토리를 지우므로(`WorkflowCanvas.tsx:813-814`), 재로드 경로는 히스토리 보존 여부를 명시적으로 다뤄야 한다.

### D-D. WS `FlowUpdateMessage` vs dirty 작업본 → **(a) 스킵 + 배너** ✅ 확정 (2026-07-17)

현재 `handleFlowUpdate`(`useSocketHandlers.ts:62-75`)는 **무조건 전체 교체** — dirty 검사 없음.

| 안                          | 동작                                                           |
| --------------------------- | -------------------------------------------------------------- |
| (a) dirty면 스킵 + 배너     | 로컬 유지. "다른 세션이 변경함 — 새로고침" 배너. 데이터 유실 0 |
| (b) dirty면 확인 다이얼로그 | "내 작업 유지 / 원격으로 교체"                                 |
| (c) 현행 유지               | dirty여도 덮어씀 — 작업 유실                                   |

**확정: (a)** — 최소 변경, 유실 없음, 문서 §6 지침("dirty면 스킵하거나 확인")과 일치.

---

## 3. 슬라이스 큐

각 슬라이스 = 수직 슬라이스, verify-green 후 다음. 슬라이스 간 context clear.

**Verifier(결정적)**: `npx eslint <touched>` 0 warning + `yarn web:test` + `yarn web:build` + `npx tsc --noEmit -p libs/flows/tsconfig.lib.json` (HEAD 기준선 대비 신규 에러 0).

> ⚠️ **테스트 인프라 실측 (2026-07-17)**
>
> - **`npx nx test flows` / `yarn nx test flows`는 존재하지 않는다** — `Cannot find configuration for task @flows/flows:test`. AC7과 CLAUDE.md가 둘 다 유령 명령을 참조 중.
> - `yarn web:test`가 도는 12개 파일은 **전부 `apps/web/src/__tests__/` 밑**. 즉 **`libs/flows`에는 실행되는 테스트가 0개** — `tempId.spec.ts`/`saveFilter.spec.ts`도 지금껏 한 번도 안 돌았다 (S3 철거 시 손실 0).
> - **새 테스트는 `apps/web/src/__tests__/`에 둔다** (S1이 그렇게 함). libs 안에 두면 안 돈다.
> - `tsc`는 HEAD에서 이미 **64 errors / 20 files** — 절대 0이 아니라 **기준선 대비 증가 0**으로 판정.

- [x] **S1 — R1a: store 팩토리 추출** (P0, 위험 0, 순수 가산) ✅ 2026-07-17
    - `useCanvasStore.ts:171`의 인라인 creator → `canvasStateCreator`로 추출
    - `export const useCanvasStore = create(canvasStateCreator)` (기존 소비자 무변경)
    - `export const createCanvasStore = () => createStore(canvasStateCreator)` (`zustand/vanilla`)
    - 검증: **AC5** — headless 인스턴스에 `loadWorkflow` → mutate → 라이브 캔버스 무영향
    - blocked-by: 없음
    - **결과**: `apps/web/src/__tests__/createCanvasStore.spec.ts` 5개 green (양방향 격리 + 드래프트 2개 독립 + 액션 표면 동일). 전체 91개 green, 빌드 green, eslint 0, tsc 신규 에러 0 (기존 2개는 줄만 4→5/366→368로 밀림). 소비자 코드 변경 0줄.

- [x] **S2 — R1b: WorkflowCanvas nodes/connections → store** (P0, 최대 위험) ✅ 2026-07-17
    - **범위 한정**: `nodes`(:259) + `connections`(:260)만. UI state는 로컬 유지 (근거 §4)
    - **로컬 이름 유지 전략**: `nodes`/`connections`/`setNodes`/`setConnections` 이름을 그대로 두고 **출처만** 교체 → ~40개 호출처 무편집. 실제 변경 = 선언 4줄 + import 2줄
    - **`nodesRef`/`connectionsRef` 미러는 존치** (초안에서 변경). 제거하면 읽기 시점이 render-snapshot → live로 바뀌는데 `executeNode`는 레이스 수정 이력 지점(obs 3948/4439). R1이 요구한 변경 아님 = S2 범위 밖. `nodesRef.current = nodes`는 `nodes` 출처만 바뀌면 의미 동일
    - **마운트 리셋 미도입**: `FlowEditorRouter`가 `useIsMobile()`로 데스크톱/모바일을 런타임 스왑 → 스토어 공유가 오히려 이득(스왑 시 그래프 유지). 리셋은 투기적 코드
    - `WorkflowCanvasRef` 18개 메서드 시그니처 **불변**
    - blocked-by: S1
    - **결과**: 91개 green, 빌드 green, eslint 0
    - ⚠️ **검증 한계**: 결정적 스위트가 이 슬라이스의 위험면을 **안 건드린다** (nodes/connections/history를 타는 테스트 0개 — 위 Verifier 박스 참조).
    - **실브라우저 스모크 (`/tutorial`, 인증 불필요, `role="owner"`)** — 튜토리얼 모달은 `localStorage['eureka-flow-tutorial-completed']='true'`로 우회:
      | 경로 | 결과 |
      | --- | --- |
      | `loadWorkflow` → 렌더 | 노드 2개 실렌더 + 줌/미니맵/flow명 정상 |
      | `addNode` (블록 클릭) | 2→3 리렌더 |
      | **드래그** (마우스 이벤트) | `left:200 top:250` → `left:300 top:360` (그리드 스냅 반영), 선택 `z-index:10` |
      | **Delete 키** | 2→1 |
      | 콘솔 | error **0** |
      `nodes`의 유일한 출처가 `useCanvasNodes()`이므로 **렌더된 개수 = 스토어 개수** (구성상 확정) → **AC6 충족**.
      드래그는 `dragStartSnapshotRef`(:1845), Delete는 `saveCheckpoint()`(:1631)를 타므로 **스토어 기반 `nodes`로부터의 체크포인트 캡처도 함께 검증됨**.
    - ❗ **미검증**: undo/redo (TutorialPage Header가 `onUndo: noop`으로 스텁 → `/tutorial`에서 도달 불가. 다만 체크포인트 *캡처*는 위에서 검증됐고, pop → `setNodes` 경로의 `setNodes`도 검증됨 — 남은 미검증 구간은 pop 자체), executeNode/runAll/소켓 (백엔드 필요). **DEV 수동 스모크 권장**

- [x] **S3 — R2: 클라 ID + 철거** (P0) ✅ 2026-07-17
    - `libs/flows/src/utils/graphId.ts` 신설 (D-A) — `newNodeId()`/`newEdgeId()`
    - 철거 완료: `tempId.ts`, `saveFilter.ts`, 두 spec, `useEdgeSync.ts`(전체), `useNodeSync.ts`(**전체** — 아래 정정), `useNodesQuery.ts`(전체), `api/edges.ts`(이미 死), `upsertEdge`, `upsertNode`, `upsertFlow`(+10개 호출처), `createNode`, `deleteNode`(api), `replaceNodeIdInState`, `deleteNodeWithSync`, `upsertMovedPositions`, `useNodeConfig.syncNodeToServer`, `generateId`, 엣지 dedup의 temp tie-break
    - **생존 확인**: `upsertPortNode`(실행 경로 — `/nodes/0/upsert` 공유), `updateFlowMetadata`(`/flows/:id/upsert` 공유), `runNode`, `getNode`, `getPortData`, `saveFlow`, `loadFlow`, `hydrateInputPorts`
    - blocked-by: S2

    **C5 정정 — `getSyncedConfig`도 삭제했다.** 계획 초안은 R5까지 남기려 했으나, 그러면 upsert 제거 직후부터 R5 착륙까지 **서버가 낡은 config로 실행하는 회귀 창**이 열린다(`syncedConfigRef`를 채우던 upsert 성공 핸들러가 사라지므로 `buildRunBody`가 항상 `{}`). 대신 실행 시 **항상 `{ config }` 전송** — 게스트 경로가 이미 그렇게 하고 있었다. 회귀 0이고 R2↔R5 결합도 끊었다. `buildRunBody`/`isConfigEqual`도 같이 삭제.

    **결과**: `yarn lint` **에러 0 / 9개 프로젝트 통과** (경고 37→9로 순감), 빌드 green, 91 테스트 green, `graphId.spec.ts` 11개 green.

    **실브라우저 검증 (`/tutorial`)** — 요청 카운터를 `XMLHttpRequest.open`/`fetch`에 심고 측정:
    | 조작 | 결과 | 네트워크 |
    | --- | --- | --- |
    | 복사/붙여넣기 (노드 생성) | 1→2 | **0회** |
    | 드래그 | 위치 이동 + 그리드 스냅 | **0회** |
    | Delete | 2→1 | **0회** |
    → **AC2 충족** (생성 시 네트워크 요청 0회)
    - 생성된 ID 실측: `n54372855c34845ef9197f2fbee88478c` — `n` + 32 hex = 33자, 대시 없음. D-A 설계대로
    - 콘솔 error 0

    ❗ **AC3(ID 라운드트립) 미검증** — save→load 왕복이 필요해 인증 없이는 불가. **DEV 검증 필수.** 서버측 근거는 확보돼 있다(§1 D1 게이트: `flow-save-use-cases.spec.ts:80-89`가 `n01`/`n02` 왕복을 이미 검증).

- [ ] **S4 — R3: workspace 모듈** (P0)
    - `libs/flows/src/workspace/`: baseline / working / `diff()` / `isDirty`
    - `diff()`는 D-B대로 영속 필드만 비교
    - `lastSavedStateRef` 문자열 비교 대체 (데스크톱 + 모바일 양쪽 — C2)
    - editor 재베이스라인은 D-C 결정 반영
    - 검증: diff 단위 테스트 (런타임 상태 변경 → `isEmpty` 유지)
    - blocked-by: S3

- [x] **S5 — R4: save 일원화 + flow 지연 생성 + baseline 배선** (P0) ✅ 2026-07-17
    - `initializeFlow`/`createNewFlow`의 즉시 `POST /flows/0/save` 제거 → 첫 save가 ID를 발급. `createNewFlow`는 이제 **동기 로컬 리셋**(`Promise<string|null>` → `void`) — 호출처 3곳(데스크톱 `handleNew`, 모바일 `handleCreateNewFlow`, `MobileNewFlowSheet`) 정리. 시트의 `isCreating` 스피너는 기다릴 게 없어져 삭제
    - `libs/flows/src/workspace/baseline.ts` 신설: `captureBaseline` / `rebaseline` / `diffAgainstBaseline`
    - **`lastSavedStateRef` 3곳 전부 교체** (계획대로 전부-아니면-전무): `FlowEditorPage`, `MobileFlowEditorPage`, `useSocketHandlers`. `serializeWorkflowState` 2벌 + `hooks/types.ts`(`SerializeWorkflowFn`) 삭제
    - blocked-by: S4

    **착수 조건 3개 처리 결과**:
    1. ✅ **정규화 후·blocks 로드 후 캡처** — 로드 경로 4곳 전부 캔버스/스토어의 작업본에서 baseline을 뜬다. `useSocketHandlers.ts:68`이 **원본 응답에서 뜨고 있었다** (정확히 이 함정) → 고침
    2. **S6로 이월** (아래 D-C 정정 참조)
    3. ✅ **전송 시점 캡처가 구조로 확정** — `rebaseline(saveBody)`가 *보낸 body*를 인자로 받는다. `saveCurrentFlow`는 그래프를 위해 라이브 스토어를 읽지 않으므로(`nodes`/`edgesData`는 `body`에서 await 이전에 캡처) **응답 시점 캡처가 불가능**하다. 테스트가 아니라 구성으로 배제됨

    **D-C 정정 — editor 재로드는 S6로, `baseline←sent`는 S5에서 조건부로.**
    초안은 S5에서 editor에게 `loadFlow` 재호출을 계획했다. 그러나 (a) 무조건 재로드는 config-only save(=서버가 다 받는 경우)에도 왕복 + undo 히스토리 삭제를 유발하고, (b) 재베이스라인은 캔버스 재로드가 **필요 없다** — baseline만 갈면 되고 작업본은 건드리면 안 된다(editor 작업 유실). 대신 S5는 **구조 변경 시 baseline을 안 잡는다**(dirty 유지 = 정직). 서버 재로드 + R5-b 경고는 S6.
    ❗ **S6 게이트는 run 경로다, save 경로가 아니다** — editor는 `canSave: true`이고 auto-save는 `canSave`만 본다. 즉 S6 이후에도 editor의 구조 변경은 auto-save로 전송된다 → D-C는 S6가 대체하지 못한다. 상보적임

    **결과**: `yarn lint` 에러 0 / 9개 프로젝트, 빌드 green, **126 → 137 테스트 green** (`baseline.spec.tsx` 11개 신규)

    **뮤테이션 테스트 3회**:
    | 뮤테이션 | 결과 |
    | --- | --- |
    | `rebaseline`의 editor 가드 제거 | 1개 실패 ✅ |
    | `rebaseline(saveBody)` → `rebaseline(toSnapshot(nodes, ...))` | **0개 실패** — 의미 동일(둘 다 send-time). 구조상 등가라 뮤테이션이 아니었음 |
    | `rebaseline`이 **응답 시점 라이브 캔버스**를 읽도록 | 3개 실패 ✅ (테스트 보강 후. 보강 전엔 0개 — 처음 쓴 in-flight 테스트는 이름값을 못 했다) |

    ❗ **미검증**: `FlowEditorPage`/`useMobileEditorBoot`의 **boot 배선 자체**는 결정적 스위트가 못 탄다(인증 필요). 단위 테스트는 `captureBaseline` *의미*와 두 함정(원본 응답/registry 타이밍)이 실제로 dirty를 만든다는 것까지 고정했으나, 페이지가 그 함수를 **옳은 인자로** 부르는지는 **DEV 수동 검증 필요**. 수용 기준 재확인: 플로우 로드 → 무조작 → dirty 표시 없음 + save 요청 0회

**→ 체크포인트: AC 1(부분)/2/3/5/6 데모 가능**

- [ ] **S6 — R5: 실행 게이트 + editor 경고** (P1) ← **다음. 🔴 실행 회귀를 닫는 슬라이스**
    - R5-a: dirty면 저장 확인 → save 완료 후 run. 거부 시 중단. `diffAgainstBaseline`(S5) 사용
    - R5-b: editor + `hasStructuralChange` → 유실 경고 (**로컬 재현 불가, DEV 검증** — C11)
    - **owner/editor 분기 필수** (착수 조건 2): save-before-run은 owner만 고친다. editor의 구조 변경은 서버가 버리므로 save 200 → run 여전히 404 → *처리한 척*만 한다. `hasStructuralChange`로 차단/경고
    - **D-C 잔여분**: editor 구조 save 후 `loadFlow` 재호출로 baseline만 서버 진실로 재설정 (**캔버스는 재로드하지 말 것** — 작업본 유실 + undo 히스토리 삭제 `WorkflowCanvas.tsx:813-814`). 단 재로드 스냅샷도 정규화 경로를 타야 함(착수 조건 1) — 원본 응답을 그대로 baseline으로 쓰면 영구 dirty
    - C5 해소 확인: `buildRunBody`가 `{}` 반환해도 config가 서버에 있음
    - 검증: **AC4**
    - blocked-by: S5 ✅

- [ ] **S7 — R6: 로컬 지속성 + 오프라인** (P1)
    - working + baseline + flowId → localStorage (IndexedDB 폴백)
    - `flowStorage.ts` 확장 (viewport LRU 50 선례 존재)
    - 부팅 시 draft 복구 확인, beforeunload 확인, save 실패 시 재시도
    - 검증: **AC1** 전체
    - blocked-by: S5
    - ⚠️ `getAutoSaveEnabled`는 키 부재 시 **false 기본**(`flowStorage.ts:54`). S3 이후 auto-save off 사용자는 수동 save 전까지 영속화 0 → S7이 이 창을 메운다. S3~S7은 한 브랜치로 함께 나가야 한다

- [ ] **S8 — R7: 단계적 로딩** (P2)
    - 응답 수신 즉시 노드 골격 → config/port 하이드레이션 후속 마이크로태스크
    - C6대로 S3 오프로드는 범위 밖
    - blocked-by: S5

- [ ] **S9 — R8: undo/redo 재정의 + 죽은 코드 제거** (P2)
    - C1 재조준: 인라인(`WorkflowCanvas.tsx:405-442`)이 진짜. `useCanvasHistory`/`useCanvasEngine`/`useCanvasLayout`은 死
    - 선택: 인라인을 `useCanvasHistory`로 흡수(死 부활, 중복 제거) vs 死 3종 삭제 + 인라인 유지
    - agent Accept(`swapFlow`) = 체크포인트 1개
    - blocked-by: S5

---

## 4. S2 범위 한정 근거 (중요)

스토어에 로컬 state 쌍둥이가 거의 다 있으나 **모양이 안 맞는다** — 모바일(리스트 편집기)용으로 설계됐기 때문:

| 개념                  | 로컬(데스크톱)          | 스토어                         | 일치             |
| --------------------- | ----------------------- | ------------------------------ | ---------------- |
| **nodes/connections** | :259/:260               | :55/:57                        | ✅ **이관 대상** |
| 선택                  | `Set<string>` 다중      | `selectedNodeId: string\|null` | ❌               |
| 클립보드              | `NodeData[]`            | `NodeData\|null`               | ❌               |
| dragState             | `initialPositions: Map` | `initialX/initialY`            | ❌               |
| connectionDraft       | `+clickMode`            | 없음                           | ❌               |
| contextMenu           | 있음                    | 없음                           | ❌               |
| history               | `pastRef`/`futureRef`   | 없음                           | ❌               |
| viewport              | ref (의도적)            | `viewport`                     | ⚠️               |

- UI state를 옮기면 모바일 소비자(단일 선택 전제)가 깨진다. **요구사항에 없다.** 문서도 "component-local nodes/connections state"만 지목.
- `viewport`는 `WorkflowCanvas.tsx:276-278` 주석이 "휠 틱마다 노드 트리 리렌더 막으려 일부러 ref"라고 명시 → 이관 시 성능 회귀. 제외.
- 데스크톱은 현재 `store.nodes`를 **한 번도 안 읽는다**(세션 내내 `[]`). 모바일은 스토어가 SoT. 이관 후 둘 다 쓰므로 **라우트 전환 시 오염 확인 필요**.
- `useTutorialSteps.ts:28-38`이 스토어 nodes/connections를 읽는 fallback 경로 보유 — 데스크톱이 `canvasState`를 넘겨 지금은 잠들어 있음(`:29` 단락). 이관 후 동작 확인.

---

## 5. 위험 등록부

### 🔴 S3가 연 것 — 미저장 노드 실행이 깨져 있다 (S6까지 존속)

S3가 실행 전 `flushPendingUpdates`/`flushPendingEdges` 대기를 제거했다. **그 대기의 존재 이유가 "실행 전 서버가 새 노드를 알게 보장"이었다.**
이제: 노드 추가 → 저장 없이 실행 → `POST /nodes/<클라ID>/run` → **서버에 없는 ID → 404**.

- 기존 노드의 **config 편집은 무사** (`{ config }`를 인라인 전송하므로).
- **구조 편집(신규 노드/엣지) + 저장 전 실행**만 해당.
- `getAutoSaveEnabled`가 키 부재 시 **false 기본**(`flowStorage.ts:54`) → **기본 사용자 경로가 정확히 이 경로다.**

**함의: R5-a(S6)는 P1 편의가 아니라 실행 정합성의 복구다.** 창은 S4+S5 두 슬라이스뿐(R5-a는 isDirty(S4) + save 일원화(S5)를 전제로 함).
→ **S3~S7은 반드시 한 브랜치로. 브랜치는 S6 착륙 전 배포 금지.**

### ✅ S3 검증 구멍 — 메웠다 (2026-07-17)

1. **save body 미검증** → `apps/web/src/__tests__/saveFlowBody.spec.tsx` **6개 green**. `@flows/web-core`를 스텁해 `api.post`에 실제로 실리는 body를 검사 (백엔드 불필요):
    - 모든 노드가 클라 ID로 실리는가 ✅
    - 삭제한 노드가 body에서 빠지는가 (= 삭제의 표현) ✅
    - 빈 플로우도 `nodes: []`를 싣는가 (C8) ✅
    - 런타임 상태(`state`/`status`/`inputData`/`outputData`/`executionStats`)가 벗겨지는가 ✅ ← D-B의 전제
    - UI측 `connections` 별칭 수용 ✅
    - flow 없을 때 `/flows/0/save`로 생성 ✅

    **뮤테이션 테스트로 스위트가 무는지 확인**: `slimNodes`를 빈 배열로 바꾸자 3개가 즉시 실패 → 통과가 우연이 아님을 확인.

2. **auto-save 트리거 미검증** → `createCanvasStore.spec.ts`에 3개 추가 (총 8개 green). 체인은 `setNodes → 스토어 → useCanvasNodes() → 새 nodes 값 → effect [nodes, connections] → onChange`. S2 스모크에서 **노드 리렌더를 실측**했고, 리렌더 자체가 "구독이 새 값을 전달했다"는 증거 → effect dep도 새 값 → 발화. 이행적으로 증명됨. 그 링크(참조 동일성)를 테스트로 고정:
    - `setNodes`가 배열/updater 양쪽에서 새 참조를 내는가 ✅
    - `updateNodeData`/`addConnection`/`deleteNode`도 새 참조를 내는가 ✅
    - 모든 그래프 쓰기가 구독자에게 통지되는가 ✅

    ❗ 남은 미검증: `onChange → triggerAutoSave → saveCurrentFlow` 전체 체인은 `FlowEditorPage` 구동이라 인증 필요.

### ✅ S5 착수 조건 — 처리 완료 (2026-07-17). 아래는 착수 전 기록, 결과는 §3 S5 항목 참조

S4의 diff 테스트는 양쪽을 같은 registry로 `snap()`하므로 아래 셋을 **원리상 볼 수 없다**. 전부 S5에서 착륙.

**S5의 수용 기준 = "방금 로드한 플로우가 clean으로 읽히는가".** 플로우 로드 → 아무것도 안 건드림 → `isDirty === false` **그리고 save 요청 0회.** 이게 S5 정합성의 전부다.

1. **baseline은 정규화된 작업본에서, blockRegistry 로드 후에 떠야 한다** — 조용히 무는 놈.
   `toSnapshot`은 `type: blockDef?.type ?? node.type`으로 매핑하고 `getNodeHeight`를 넣는다. `loadWorkflow`는 캔버스에 넣기 전 정규화한다(`config ?? {}`, `position ?? {x:0,y:0}`, `deduplicateEdges`).
   → **원본 `loadFlow` 응답에서 baseline을 뜨면**, 또는 **blocks가 아직 안 실려 `blockRegistry`가 `{}`일 때 뜨면**, `type`/`position`/`height`/엣지 개수가 어긋나 **로드 직후 아무것도 안 건드렸는데 dirty로 읽힌다.**
   연쇄: 로드마다 auto-save 발화 + D-D("dirty면 WS 업데이트 스킵")가 영구 오발화.
   → baseline은 **캔버스가 실제로 받은 정규화 후 노드**에서, **blocks 로드 후에** 뜬다.
   ✅ 하위 위험 해소: `getNodeHeight`는 순수함 (`node.height` / `node.config.textareaHeight`만 읽음, DOM 측정 없음) — 확인함.

2. **실행 회귀는 S6에서 editor에겐 안 닫힌다** — 지금 결정할 것, 나중에 발견하지 말 것.
   save-before-run은 **owner 경로**를 고친다(dirty → save → 서버가 노드를 알게 됨 → run 성공). 그러나 **비소유자 editor의 구조 변경은 서버가 조용히 버린다(C11)**. → editor가 노드 추가 → dirty → save "성공"(200) → **서버엔 여전히 그 노드 없음 → run이 그대로 404.**
   save-before-run이 _처리한 것처럼 보이게_ 만들 뿐이다.
   → **S6를 `hasStructuralChange`에 묶는다**(S4에서 정확히 이걸 위해 만들었다): editor + 구조 diff → 그 save는 구조를 영속화 못 하므로 run이 성공할 수 없다 → **save-then-404 대신 차단/경고**. owner가 깨끗한 경로.

3. **`baseline ← 보낸 스냅샷`을, 응답 시점의 작업본이 아니라 전송 시점에 캡처.**
   save는 비동기다. 전송 중 사용자가 편집했는데 응답 도착 시 `baseline = 현재 작업본`으로 잡으면, **그 편집이 "이미 저장됨"으로 표시돼 다음 diff에서 증발한다.**
   → 보낸 body(`saveBody` — 이미 슬림 스냅샷이다)가 옳은 baseline. D-C의 owner/editor 분기와도 깔끔히 맞는다: owner → `baseline = 보낸 스냅샷`, editor → `baseline = 서버 재로드`(그들에겐 보낸 것 ≠ 저장된 것이므로).

**`lastSavedStateRef` 교체 범위**: 3곳에 산다 — `FlowEditorPage`, 모바일 페이지, `useSocketHandlers`. `isDirty`로 바꾸려면 **셋 다 하거나 하나도 하지 말 것** — 반만 바꾸면 dirty 추적기 둘이 서로 다른 말을 한다. 그리고 "clean이면 저장 안 함" 게이트를 보존할 것 — 없애면 auto-save가 루프하거나 아예 안 뜬다.

### 기타

| 위험                                                                                | 완화                                                |
| ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| `WorkflowCanvas.tsx` 2,876줄, `executeNode`에만 `setNodes` 12개                     | S2를 nodes/connections로 한정. ref 계약 테스트 선행 |
| 공유 엔드포인트 2개가 생존자+철거대상 동거 (`/nodes/0/upsert`, `/flows/:id/upsert`) | 경로 문자열 grep 금지. 함수 단위 철거               |
| 운영 flow에 temp 포맷 ID가 canonical로 실재 (`tempId.ts:20-25`, flow `1008748`)     | ULID가 기존 ID와 프리픽스 안 겹침. 혼재 허용(§7)    |
| editor 구조 유실이 로컬에서 재현 불가 (C11)                                         | S6은 DEV 배포 검증 필수                             |
| auto-save 기본 false + per-entity 제거 = 영속화 공백                                | S3~S7 한 브랜치로                                   |
| 모바일 복사본 6종 (C2)                                                              | R3/R4/R6를 공유 층에                                |

---

## 6. 열린 이슈 (요구사항 §7 + 정찰 추가)

- 서버 시퀀스 ID와 클라 ULID 장기 공존 — 혼재 허용으로 진행
- editor 구조 편집 서버 수용 — 백엔드 과제
- 단계적 로딩 API 분리 — 백엔드 과제
- 로컬 draft 다중 탭 충돌
- **(추가)** `handleSave`(`FlowEditorPage.tsx:403`)/`retrySave`에 `canSave` 게이트 없음 — 기존 구멍, 범위 밖
- **(추가)** `#` 툼스톤(C7)이 기존 flow의 `nodeIds$$`에 이미 쌓여 있을 수 있음 — 서버측 정리 필요 여부 미확인
