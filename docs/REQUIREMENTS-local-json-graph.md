# eureka-flow — 로컬 JSON 그래프(워크트리) 전환 요구사항

> 대상 리포: `eureka-flow` (프론트엔드). 이 문서는 Claude Code에 구현을 지시하기 위한 요구사항 명세다.
> 근거: `eureka-flow`(develop) / `eureka-flow-agents`(origin/feat/browser-agent) / `eureka-flows-api`(서버) 코드 분석. 2026-07-17.

---

## 0. 배경과 목표

`eureka-flow-agents` 브랜치는 "draft에서 편집 → diff를 plan으로 리뷰 → Accept 시 `swapFlow`로 통째 교체"하는 에이전트 아키텍처를 확정했다 (`docs/browser-agent/design/SPEC.md`). 이 모델이 성립하려면 eureka-flow 본체가 다음을 갖춰야 한다.

1. 플로우 전체(nodes/edges/ports/config)를 **하나의 JSON 문서**로 관리하고, 캔버스는 그 JSON을 구독해 렌더한다 (JSON이 바뀌면 화면이 바뀐다).
2. 노드/엣지 생성 시 **서버 왕복으로 ID를 발급받지 않는다** — 클라이언트가 ID를 확정 생성한다.
3. **원본(baseline) / 작업본(working copy)** 을 git 워크트리처럼 분리 관리하고, 저장은 `POST /flows/:id/save` 스냅샷 하나로 일원화한다.
4. 오프라인/미저장 상태에서도 편집이 완전히 동작하고, 서버 연결은 save 시점에만 필요하다.

## 1. 확정된 결정사항

| #   | 결정                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------- |
| D1  | **서버는 클라이언트 생성 ID를 이미 수용한다** (§2에서 코드로 확인). 백엔드 변경 없이 (a)안 — 클라 ID 확정 — 으로 진행한다. |
| D2  | **미저장 노드 실행 정책**: 실행 전 dirty면 **save 확인(confirm) 후 실행**. 저장 거부 시 실행 중단.                         |
| D3  | **포트(port node, `stereo: 'port'`) 데이터도 JSON 문서에 포함**한다.                                                       |
| D4  | 노드/엣지/블럭 인스턴스 생성 시 서버 ID 발급 API 호출(`createNodeAsync`/`createEdgeAsync`)을 제거한다.                     |

## 2. 서버(eureka-flows-api) 분석 결과 — 왜 (a)안이 가능한가

`POST /flows/:id/save` 경로: `doPostSave` → `doPostSaveV2` → `saveFlowScenario` → `proxy.node.upsertNodesV2($flow, [...nodes, ...edges], { useRandom: true })`.

`upsertNodesV2` (`src/modules/flows/proxy-graph.ts:1205`)의 노드별 처리:

```ts
const node = _id
    ? await this.get(_id, $def) // "safe get" — 없으면 그 ID 그대로 생성 (get-or-make)
    : await this.nextNode($flow, $def, { useRandom }); // id 없을 때만 서버 시퀀스 발급
```

- **body에 id가 있으면 그 id로 get-or-make** — 존재하지 않는 id는 **그대로 신규 생성**된다. 클라이언트 생성 ID가 canonical ID가 되는 것이 이미 서버의 동작이다. (프론트의 `tempId.ts` 주석이 말하는 "temp ID 누출이 canonical로 굳는" 현상이 바로 이것 — 지금까지는 버그 취급했지만, 이제 이걸 정식 계약으로 삼는다.)
- id가 없는 항목만 `nextNode` → `nextId(step)` — **숫자 문자열 시퀀스** (예: `"1000077"`).
- 검증: 중복 id → 400 (`hasDuplicate`), 기존 노드와 `stereo` 불일치 → 에러, 기존 노드의 `flowId` 불일치(다른 flow 소속 id 충돌) → 에러, `deletedAt` 존재 → 에러, `#`-prefix id는 삭제 마커로 스킵.
- save는 flow의 `nodeIds$$`/`edgeIds$$`를 **body 목록으로 전체 교체** — 목록에서 빠진 노드는 flow 멤버십에서 제외된다 (모델 row 자체는 남음). 즉 삭제는 "save 목록에서 제외"로 표현 가능.
- **ports는 서버가 파생 생성**: 엣지의 `sourceNodeId:sourcePortId` 참조로부터 `findPort`가 `nodeId:portId` 형식 id로 생성/갱신. 클라 노드 ID를 쓰면 포트 ID도 클라에서 결정적으로 파생 가능.
- 신규 flow: `POST /flows/0/save` → 내부에서 flow 먼저 생성(`doPost`) 후 V2 저장. flow ID 자체는 여전히 서버 발급 (이건 유지 — 첫 save 시점에 받으면 됨).

**Editor(비소유자) save의 실제 동작 (`flow-save-use-cases.ts`)**: 소유된 flow + 세션 uid 존재 + 비소유자면 `saveSessionConfigOverlay`로 라우팅 — body 중 **각 노드의 config만** per-user `SessionModel`(id = `uid+flowId` 파생)에 merge 저장하고, **원본 node/edge/flow 구조는 불변**. 구조 변경(노드 추가/삭제/엣지)은 **조용히 무시된다**. load 시 `overlayNodesForRead`가 본인 오버레이 config를 머지해 돌려준다.

→ **Session overlay와 작업본의 관계 (정리)**: 두 레이어는 역할이 다르다. 작업본(로컬 JSON)은 *모든 사용자*의 편집 버퍼(클라이언트), session overlay는 _editor의 config만_ 받는 서버측 영속 레이어다. 충돌하지 않고 직렬로 연결된다: `편집 → 작업본(로컬) → save → [owner: 원본 반영 | editor: config만 overlay 반영] → load 시 overlay 머지된 상태가 새 baseline`. 단, **editor의 구조 편집은 save해도 유실**되므로 프론트가 이를 인지시켜야 한다 (§4 R5-b).

### 클라이언트 ID 규칙 (신규 계약)

- 형식: **소문자 영숫자, 구분 가능한 prefix** 권장 — 노드 `n<ulid>`, 엣지 `e<ulid>` (예: `n01jx3k9f7q2m8v4t6w0zr5b3d`).
- 서버 발급 ID는 숫자-only 문자열이므로, **숫자로 시작하지 않는 prefix**를 쓰면 시퀀스와 충돌 불가능.
- 금지 문자: `:`(포트 참조 구분자), `@`(run 참조), `#`(삭제 마커), 공백, `-`(flow alias 파싱에서 split 구분자로 사용됨 — 노드 id에는 무해하나 일관성을 위해 회피).
- 기존 `temp_`/`node_`/`edge_` prefix와 세션 temp-ID 레지스트리는 **완전 폐기**.

## 3. 현재 구조 요약 (제거/변경 대상)

| 현재                                                                                                                | 위치                                                                                 | 처분                              |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------- |
| 노드 생성 → `POST /nodes/0/upsert`로 서버 ID 수령                                                                   | `libs/flows/src/hooks/useNodeSync.ts` `createNodeAsync`                              | **제거**                          |
| 엣지 생성 → `POST /flows/:id/upsert`                                                                                | `libs/flows/src/hooks/useEdgeSync.ts` `createEdgeAsync`                              | **제거**                          |
| config/위치 변경 500ms 디바운스 per-entity upsert                                                                   | `useNodeSync.syncNodeUpdate`                                                         | **제거** (스냅샷 save로 일원화)   |
| tempId 생성·resolve·교체 (`generateTempId`, `markTempIdResolved`, `onIdAssigned`, `waitForNodeId`, `flushPending*`) | `libs/flows/src/utils/tempId.ts`, `useNodeSync`, `useEdgeSync`, `WorkflowCanvas.tsx` | **제거**                          |
| save 시 미해결 temp 제외                                                                                            | `libs/flows/src/utils/saveFilter.ts`                                                 | **제거** (클라 ID가 곧 canonical) |
| 부팅 시 즉시 `POST /flows/0/save`로 flow 생성                                                                       | `libs/flows/src/hooks/useFlows.ts` `initializeFlow`, `createNewFlow`                 | **지연 생성으로 변경**            |
| 캔버스 = `WorkflowCanvas.tsx` component-local useState                                                              | `apps/web/.../WorkflowCanvas.tsx`                                                    | **store 구독으로 이관**           |
| undo/redo 전체 스냅샷 스택                                                                                          | `libs/flows/src/hooks/useCanvasHistory.ts`                                           | 유지하되 작업본 모델 위로 재정의  |

## 4. 요구사항

### R1. canvas store 팩토리화 + JSON 단일 진실 (P0)

- `libs/flows/src/stores/useCanvasStore.ts`를 `canvasStateCreator`로 추출하고 두 가지를 export:
    - `export const useCanvasStore = create(canvasStateCreator)` — 라이브 싱글턴 (기존 소비자 무변경)
    - `export const createCanvasStore = () => createStore(canvasStateCreator)` — `zustand/vanilla` headless 인스턴스 (에이전트 draft·작업본용)
- `WorkflowCanvas.tsx`의 component-local nodes/connections state를 store 구독으로 이관한다. imperative ref API(`getWorkflow`/`updateNode`/`loadWorkflow` 등)는 시그니처를 유지하되 내부는 store를 읽고 쓴다 (agents 브랜치의 `createDesktopCanvasBinding`이 이 ref를 wrap하므로 계약 유지 필수).
- 결과: store JSON 변경 → 캔버스 자동 리렌더. 외부(non-React) 코드가 store를 구독 가능 (agents binding의 pull-only 한계 해소).

### R2. 클라이언트 ID 확정 생성 (P0)

- `libs/flows/src/utils/`에 ID 생성기 신설 (예: `graphId.ts`): §2의 ID 규칙 구현. ULID 또는 동등한 충돌-안전 생성기.
- 노드/엣지 생성 시 이 ID를 즉시 확정 부여. 서버 왕복·ID 교체·resolve 없음.
- §3 표의 제거 대상 일괄 제거: `tempId.ts`, `saveFilter.ts`, `useNodeSync`의 create/resolve 경로, `useEdgeSync` 전체, `WorkflowCanvas.tsx`/mobile-editor의 `generateTempId`·`onIdAssigned` 사용처.
- 노드 실행 전 `flushPendingUpdates`/`flushPendingEdges` 대기 로직은 R5(save 확인)로 대체.

### R3. 원본/작업본(워크트리) 모델 (P0)

- 새 모듈 (예: `libs/flows/src/workspace/`):
    - **baseline**: 마지막으로 서버에 저장(또는 로드)된 스냅샷 JSON.
    - **working copy**: store가 렌더 중인 현재 편집 상태.
    - `diff(working, baseline)` → `{ addedNodes, removedNodes, modifiedNodes, addedEdges, removedEdges, isEmpty }` (agents SPEC의 `FlowDiff` 형태와 호환).
    - `isDirty = !diff.isEmpty` — 기존 `lastSavedStateRef` 문자열 비교(`FlowEditorPage.tsx`)를 대체.
- save 성공 시 `baseline ← working copy` (커밋 시맨틱).
- **스냅샷 JSON 스키마에 ports 포함 (D3)**: `{ id: 'nodeId:portId', direction, dataType, data? ... }`. 서버 load 응답의 `ports` 배열을 그대로 문서에 편입하고, 로컬에서 노드/엣지 생성 시 포트 엔트리도 결정적으로 파생·유지한다. (save body는 현행 `{ nodes, edges }` 유지 — 서버가 ports를 파생 생성하므로 전송 불필요.)
- 에이전트 draft(agents 브랜치의 Workspace)는 이 모듈의 3번째 인스턴스로 자연 편입: working copy에서 fork → Accept 시 working copy로 promote. `swapFlow`는 auto-save를 트리거하지 않는다 (agents SPEC §3 전제).

### R4. 저장 일원화 + 신규 flow 지연 생성 (P0)

- 모든 영속화는 `POST /flows/:id/save` 스냅샷 하나로. auto-save(2s 디바운스)와 수동 save는 유지하되, per-entity 동기화는 존재하지 않는다.
- `initializeFlow`/`createNewFlow`의 즉시 `POST /flows/0/save` 제거 → 로컬 작업본으로 시작하고 **첫 save 때** `/flows/0/save`로 flow ID를 발급받아 `flowStorage.setFlowId` + URL 갱신.
- 라벨·위치·config 변경은 frontend-only가 된다 (agents SPEC §3의 "will be fixed later" 이행).

### R5. 실행(run) 게이트 + editor 안내 (P1)

- **R5-a (D2)**: 노드/플로우 실행 요청 시 `isDirty`면 저장 확인 다이얼로그("변경사항을 저장하고 실행할까요?") → 확인 시 save 완료 후 run, 거부/실패 시 실행 중단. 서버 실행은 서버에 저장된 상태를 읽으므로 미저장 실행은 허용하지 않는다.
- **R5-b**: editor(비소유자, `isEditable && !hasOwned`)의 구조 편집(노드/엣지 추가·삭제)은 서버가 config-overlay만 저장하고 구조를 무시하므로(§2), 구조 변경이 diff에 포함된 상태로 save하면 **유실 경고**를 표시한다 (예: "편집자 권한에서는 노드 구성값만 저장됩니다"). 최소 구현: diff에 구조 변경 존재 + editor 역할 → 경고 배너/토스트.

### R6. 로컬 지속성 & 오프라인 (P1)

- 작업본 + baseline + flowId(또는 "unsaved" 마커)를 localStorage(용량 초과 대비 IndexedDB 폴백)에 주기 저장 → 새로고침/오프라인에도 작업본 생존.
- 부팅 시 로컬 draft가 있으면 서버 스냅샷과 비교해 복구 여부 확인 (draft가 더 최신이면 "저장 안 된 변경 복구?" 확인).
- 페이지 이탈(beforeunload)·플로우 전환 시 dirty면 확인.
- save 실패(오프라인) 시: 작업본 유지, saveStatus='error' + 재시도(기존 `retrySave` 활용). 연결 복구 감지 시 재시도 안내.

### R7. 단계적 로딩 (P2)

- 로딩 순서: ① blocks + nodes(구조) → 캔버스 골격 렌더 → ② edges·ports → 연결 렌더 → ③ config/포트 데이터(대용량 S3 오프로드 포함) → 상세 완성.
- 현행 `GET /flows/:id/load` 단일 응답 안에서도 단계 적용 가능: 응답 수신 즉시 노드 골격을 store에 넣어 그리고, config/port data 하이드레이션을 후속 마이크로태스크로 분리. (서버 분리 호출은 후속 과제.)

### R8. undo/redo 재정의 (P2)

- `useCanvasHistory`의 스냅샷 스택 방식 유지하되 작업본 JSON 위에서 동작하도록 정리.
- 에이전트 Accept(`swapFlow`) = 단일 체크포인트 1개로 기록 → 통째 undo 가능 (agents SPEC "Revert" 항목과 정합).
- undo/redo는 서버 호출 없음(현행 유지) — 다음 save에서 스냅샷으로 반영.

## 5. 수용 기준 (Acceptance Criteria)

1. 네트워크 차단(DevTools offline) 상태에서: 새 플로우 시작, 노드/엣지 추가·삭제·설정·이동, undo/redo, 새로고침 후 작업본 복구가 전부 동작한다. 네트워크 복구 후 save 1회로 전체가 서버에 반영된다.
2. 노드/엣지 생성 시 네트워크 요청이 발생하지 않는다 (`/nodes/0/upsert`, `/flows/:id/upsert` 호출 0회).
3. 클라 생성 ID로 save → load 라운드트립 후 ID가 변형 없이 유지된다.
4. dirty 상태에서 노드 실행 시 저장 확인이 뜨고, 저장 완료 후에만 run이 호출된다.
5. `createCanvasStore()`로 만든 headless 인스턴스에 `loadWorkflow` → mutate → diff가 라이브 캔버스에 영향 없이 동작한다 (agents 브랜치 Workspace의 전제).
6. store의 nodes/connections를 직접 변경하면 캔버스가 리렌더된다.
7. 기존 테스트(`yarn web:test`, `npx nx test flows`) 통과 + 제거된 모듈의 spec(`tempId.spec.ts`, `saveFilter.spec.ts`) 정리.

## 6. 주의사항

- **WorkflowCanvas.tsx는 2,500줄+ 대형 파일** — R1 이관 시 imperative ref 계약(`WorkflowCanvasRef`)과 socket handler(`useSocketHandlers`의 `loadWorkflow`/`updateNodeFromServer`) 경로를 깨지 않도록 단계적으로.
- WebSocket `FlowUpdateMessage`(타 세션 변경) 수신 시 로컬 작업본이 dirty면 무조건 덮어쓰지 말 것 — 최소한 dirty면 스킵하거나 확인. (drift hash는 agents SPEC에서 deferred — 이번 범위 아님.)
- 서버 save는 body 목록으로 flow 멤버십을 전체 교체하므로, 부분 스냅샷을 보내면 노드가 유실된다. save body는 항상 작업본 전체에서 생성.
- mobile editor(`apps/web/src/app/features/mobile-editor/`)도 같은 hooks를 쓰므로 동일하게 마이그레이션.
- `POST /flows/:id/upsert`는 flow 메타데이터 갱신(`updateFlowMetadata`) 용도로는 계속 사용 (이름/공개 설정 — 구조 저장과 무관).

## 7. 열린 이슈 (이번 구현 범위 밖, 추후 결정)

- 서버 시퀀스 ID와 클라 ID의 장기 공존 정책 (기존 플로우는 숫자 ID, 신규 노드는 ULID — 혼재 허용으로 진행).
- editor의 구조 편집을 서버가 수용하는 방안 (session overlay의 구조 확장) — 백엔드 과제.
- 단계적 로딩의 서버 API 분리 (`/load`를 구조/데이터로 분할) — 백엔드 과제.
- 로컬 draft의 다중 탭 동시 편집 충돌.
