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

- [ ] **S2 — R1b: WorkflowCanvas nodes/connections → store** (P0, 최대 위험)
    - **범위 한정**: `nodes`(:259) + `connections`(:260)만. UI state는 로컬 유지 (근거 아래)
    - `nodesRef`/`connectionsRef` 미러(:269-272) 제거 → `useCanvasStore.getState()`로 대체
    - `WorkflowCanvasRef` 18개 메서드 시그니처 **불변** — 이관 전 계약 테스트로 못박기
    - 검증: **AC6** — store 직접 변경 → 캔버스 리렌더. ref 계약 테스트 green
    - blocked-by: S1

- [ ] **S3 — R2: 클라 ID + 철거** (P0)
    - `libs/flows/src/utils/graphId.ts` 신설 (D-A)
    - 철거: `tempId.ts`, `saveFilter.ts`, 두 spec, `useEdgeSync.ts`(전체), `useNodeSync.ts`(`getSyncedConfig` 제외 전부), `api/edges.ts`(이미 死), `upsertEdge`, `upsertFlow`(+10개 호출처), `createNode`, `deleteNode`, `createNodeOnBackend`, `useCreateNodeMutation`, `useCreateEdgeMutation`, `useUpsertNodeMutation`
    - **생존 필수**: `upsertPortNode`(실행 경로 — `/nodes/0/upsert` 공유), `updateFlowMetadata`(`/flows/:id/upsert` 공유), `runNode`, `getNode`, `getPortData`, `saveFlow`, `loadFlow`
    - 검증: **AC2** (생성 시 네트워크 0회), **AC3** (ID 라운드트립)
    - blocked-by: S2

- [ ] **S4 — R3: workspace 모듈** (P0)
    - `libs/flows/src/workspace/`: baseline / working / `diff()` / `isDirty`
    - `diff()`는 D-B대로 영속 필드만 비교
    - `lastSavedStateRef` 문자열 비교 대체 (데스크톱 + 모바일 양쪽 — C2)
    - editor 재베이스라인은 D-C 결정 반영
    - 검증: diff 단위 테스트 (런타임 상태 변경 → `isEmpty` 유지)
    - blocked-by: S3

- [ ] **S5 — R4: save 일원화 + flow 지연 생성** (P0)
    - 부팅 시 `POST /flows/0/save` 제거 → 첫 save 때 발급
    - save 성공 시 `baseline ← working` (owner) / D-C (editor)
    - `setQueryData` 유지, `invalidateQueries` 금지 (CLAUDE.md)
    - **`nodes: []`도 반드시 전송** (C8)
    - 검증: **AC1** 부분 (새 플로우 오프라인 시작)
    - blocked-by: S4

**→ 체크포인트: AC 1(부분)/2/3/5/6 데모 가능**

- [ ] **S6 — R5: 실행 게이트 + editor 경고** (P1)
    - R5-a: dirty면 저장 확인 → save 완료 후 run. 거부 시 중단
    - R5-b: editor + 구조 diff → 유실 경고 (**로컬 재현 불가, DEV 검증** — C11)
    - C5 해소 확인: `buildRunBody`가 `{}` 반환해도 config가 서버에 있음
    - 검증: **AC4**
    - blocked-by: S5

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
