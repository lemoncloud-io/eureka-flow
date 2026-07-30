# PLAN — 엔진 `NodeState` 갭 정리

작성 2026-07-30 · 대상 `libs/engine` · 배경 [`node-state-model.md`](./node-state-model.md)

랜딩되면 `PLAN.md` §15로 접고 이 파일은 그 절의 배경 자료로 남긴다.

---

## Destination

엔진이 **자기가 모르는 state를 만났을 때 조용히 틀리지 않게** 한다. 부수적으로 서버 계약과의
목록 차이(`''`·`WAITING`·`SKIPPED`)를 닫는다.

우선순위가 이 순서인 이유: 목록을 3개 채워도 **다음에 서버가 state를 하나 더 늘리면 같은
함정을 다시 밟는다.** 목록은 증상이고 fallback이 원인이다.

## 왜 지금

flow-mcp가 엔진 규칙을 채택하면서(`@lemoncloud/flow-mcp@1.7.0`, PR #12) `RANK_AS`라는
국소 보정을 갖게 됐다. 같은 리듀서를 쓰는 브라우저·CLI는 그 보정이 없다. 소비자마다
복제하면 **엔진으로 모은 규칙이 다시 셋으로 흩어진다.**

근거 전문은 `node-state-model.md`. 요지 3줄:

- 계약 8개(`types-graph.ts:163-172`) vs 엔진 5개(`build/types.d.ts:15`)
- `parseSocketFrame`이 미지 state를 `state: undefined`로 떨어뜨린다 — 프레임은 살고 의미만 빈다
- `priority(unknown) = -1` + `shouldUpdateState`의 `>=` → 미지 state는 **못 들어오면서
  동시에 아무거나에 밀려난다**

## ✅ 슬라이스 0 — 판정 완료 (2026-07-30)

**질문: 와이어가 실제로 `SKIPPED`/`WAITING`을 싣는가?**

**답: 오늘은 안 싣는다. 단 "예약어"가 아니라 "제거된 기능"이다.** 근거 전문은
[`node-state-model.md` §4](./node-state-model.md#4-와이어가-실제로-이-둘을-싣는가--판정-완료).
요지:

- 소켓 프레임 빌더는 하나(`transformer-graph.ts:1546` `asSocketNodeEvent`)고 state는 5분기
  삼항이 전부 → 와이어 어휘 = `{READY, RUNNING, COMPLETED, ERROR}`. `''`는 도달 불가
  (`RunNodeStage`에 `null`이 없다) → **엔진 유니온 5개가 오늘 와이어와 정확히 일치한다**
- 그런데 `SKIPPED`는 한때 실렸다. `disabled` 노드를 그렇게 마킹했고
  (`setStatusAndFlush(nodeId, 'SKIPPED')`, broadcast 포함), **`b2093a9` "v0.26.227a cleanup"**
  (2026-02-28)이 proxy → proxy-graph V2 이행 중 `disabled` 처리째로 지웠다. develop에
  `disabled` 노드 처리가 0건이다

> **원래 이 자리에 있던 전제 두 개를 철회한다.** ① "노드 실행 state를 계산하는 코드가
> eureka-flows-api에 없다" → 있다(`transformer-graph.ts`). ② "로컬 grep으로는 구조적으로
> 답이 안 나온다, 타입 전용 패키지라" → `node_modules`만 본 얘기였다. 서버 **소스 레포**가
> 로컬에 있고 거기서 판정된다.

| 답                                 | 진행                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------- |
| A. 싣는다                          | S1 → S2 → S2b → S3 → S4 → S5 전부                                          |
| B. 안 싣는다 (예약어일 뿐)         | S1 → S3(문서만) → S5. 유니온 확장(S2)은 **하지 않는다** — 죽은 코드        |
| C. 판정 불가                       | S1만. 나머지는 안개로 남기고 `PLAN.md`에 미해결로 기록                     |
| **← 실제 답: B이되 "제거된 기능"** | **S1 → S3 지금. S2·S2b·S4는 보류(defer), 취소 아님. S5는 아래대로 뒤집힘** |

**왜 취소가 아니라 보류인가.** B의 원래 논거는 "유니온 확장 = 죽은 코드"였다. 그 전제는
`SKIPPED`가 **처음부터 쓰인 적 없는 예약어**일 때만 성립한다. 실제로는 구현돼 돌다가
리팩터에 딸려 나갔고, 타입 계약(`NodeStatusType`)은 여전히 예약하고 있으며
`GuardResult.nextState`라는 미사용 훅까지 남아 있다. 기능이 돌아오면 S2는 선작업이 된다 —
지금 확장하면 이르고, 지금 **취소**하면 다음에 같은 조사를 다시 한다.

**미검증 1건**: 배포된 프로덕션 버전이 이 소스와 같은지는 확인 못 했다(로컬 develop
0.26.621d, 이 레포가 설치한 타입 패키지 0.26.609). 재도입 흔적이 4개월간 0이라 뒤집힐
가능성은 낮지만, S2를 실제로 착수하기 전에는 실측(인증된 `run_get` 또는 프레임 덤프)으로
한 번 확인할 것.

S1은 세 갈래 모두 공통이다 — 그래서 먼저 한다.

---

## Slice Queue

### S1 — 미지 state의 fallback을 안전하게 (답 안 기다림, 바로 가능)

**문제**: `priority(state) = STATE_PRIORITY[state] ?? -1`. `-1` 센티넬이 비교를 뒤집는다.

**수정 방향** (구현 시 택1, 근거 기록):

- (a) 미지 state는 `shouldUpdateState`가 **명시적으로 last-write** 처리 — flow-mcp가 밖에서
  하고 있는 것을 안으로 들이는 것. 소비자 보정이 사라진다
- (b) 미지 state는 **거부**하고 호출자에게 알린다 (`{ accepted: false, reason: 'unknown-state' }`)
- (c) `-1` 유지하되 양방향 비대칭을 문서화 — **비추천**, 함정을 계약으로 승격시킴

(a)를 권한다: 프로덕션에서 flow-mcp가 이미 그 동작으로 돌고 있고(1.7.0), 조용한 손실이 없다.

**브라우저에는 앞단이 하나 더 있다 (확인함).** `libs/flows/src/consts/status.ts:6`의
`VALID_STATES`가 **엔진과 별개인 두 번째 5개짜리 화이트리스트**다. `getEffectiveState`가
로드·리프레시 경로(`WorkflowCanvas.tsx:884-885`)에서 미지 state를 `undefined`로 먼저
지워버리므로, `shouldUpdateState`를 어떻게 고쳐도 그 경로에서는 **아무 변화가 없다**
(`:891`의 `force || isActiveExecution || shouldUpdateState(...)`까지 도달하기 전에 이미 값이 없다).
S1을 하려면 `getEffectiveState`가 자기 Set 대신 `isNodeState`에 위임하도록 같이 옮겨야 한다.
**S1에서 하는 건 위임뿐이고 동작은 안 바뀐다** — 유니온이 아직 5개라 통과하는 값이 같다.
새 state가 실제로 흘러 들어오는 건 S2 이후고, 그때 두 경로가 갈라지지 않게 하려고 미리
한 곳으로 모으는 것이다(S2 게이트의 `VALID_STATES` 제거 항목이 그 결과를 확인한다).

**게이트**

- [ ] `nx test flow-engine` green
- [ ] 새 테스트: 미지 state가 `next`일 때 / `current`일 때 각각 어떻게 되는지 고정
- [ ] `parseSocketFrame`이 state를 지우는 것과의 상호작용 테스트 — 리듀서가 `undefined`
      state 이벤트를 받았을 때 노드를 건드리지 않는지

### S2 — 유니온·Set·우선순위 확장 (⏸ **보류** — S0 판정에 따라)

> **착수하지 말 것.** S0 = "오늘 와이어에 없음". 지금 넓히면 도달하지 않는 값을 위한
> 코드가 된다. 반대로 **취소도 하지 말 것** — `disabled` 노드 기능이 돌아오면 그대로 필요하다
> (S0 절 참조). 착수 조건: ① `disabled`/조건분기 기능이 서버에 복귀 **또는**
> ② 실측으로 프로덕션이 `SKIPPED`를 싣는 것이 확인됨.

**`NodeState`에 `WAITING`, `SKIPPED` 추가.** `''`는 **추가하지 않는다** — 의미가 "state 없음"이라
`undefined`로 떨어지는 현재 동작이 맞다 (`node-state-model.md` §3-2).

**우선순위 배치** — 서버 주석이 순서를 정해준다 (`types-graph.ts:165-171`):

```
WAITING: '필수 입력 대기 중'      → READY 이전
READY:   '모든 필수 입력 준비됨'  → 실행 가능
SKIPPED: '조건 분기에 의해 실행되지 않음' → 터미널
```

제안:

| state       | priority | 근거                                                                                                                                                                                                                                                                                                  |
| ----------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IDLE        | 0        | 그대로                                                                                                                                                                                                                                                                                                |
| WAITING     | 1        | READY 이전 (입력 대기 → 준비 완료)                                                                                                                                                                                                                                                                    |
| READY       | 2        |                                                                                                                                                                                                                                                                                                       |
| RUNNING     | 3        |                                                                                                                                                                                                                                                                                                       |
| COMPLETED   | 4        |                                                                                                                                                                                                                                                                                                       |
| **SKIPPED** | **4**    | **COMPLETED와 동티어** — 둘 다 터미널이고, `>=` 비교라 동티어면 나중 프레임이 이긴다. COMPLETED보다 위로 두면 "완료된 노드가 skipped로 뒤집히는" 전이가 허용되고, 아래로 두면 SKIPPED 프레임이 버려진다. flow-mcp가 `RANK_AS: { SKIPPED: 'COMPLETED' }`로 프로덕션에서 쓰는 배치가 정확히 이 동티어다 |
| ERROR       | 5        | 여전히 전부 이김                                                                                                                                                                                                                                                                                      |

**번호 재배정 — 확인 끝, 안전** (2026-07-30). `STATE_PRIORITY`의 유일한 출현이
`libs/engine/src/runtime/executionReducer.ts:6`이고 `priority()`(`:8`)만 읽는다. 값이
직렬화·저장·비교 대상으로 밖에 나가는 경로 없음(`grep -rn STATE_PRIORITY libs apps` →
소스는 그 한 줄, 나머지는 `dist/`·`build/` 산출물). 상대 순서만 쓰이므로 재배정해도 된다.

**두 번째 화이트리스트를 같이 옮겨야 한다.** `libs/flows/src/consts/status.ts:6`
`VALID_STATES`가 엔진과 독립된 5개 목록이다. 엔진 유니온만 넓히면 **소켓 경로는 SKIPPED를
받고 로드 경로(`getEffectiveState`)는 버린다** — 한 노드에 대해 두 경로가 다르게 판단하는
상태가 되고, 이건 지금처럼 양쪽이 똑같이 버리는 것보다 나쁘다. `getEffectiveState`는 자기
Set을 지우고 `isNodeState`에 위임.

**게이트**

- [ ] `isNodeState('SKIPPED')` / `('WAITING')` → true
- [ ] `shouldUpdateState('RUNNING','SKIPPED')` → true (더는 버려지지 않음)
- [ ] `shouldUpdateState('SKIPPED','RUNNING')` → false (되돌려지지 않음)
- [ ] `shouldUpdateState('SKIPPED','ERROR')` → true (ERROR는 이김)
- [ ] `shouldUpdateState('COMPLETED','SKIPPED')` → true, 역도 true (동티어 = last-write)
- [x] `STATE_PRIORITY` 값이 저장/직렬화되지 않음을 확인 (위 단락, 2026-07-30)
- [ ] `getEffectiveState('SKIPPED')` → `'SKIPPED'` (더는 `undefined`가 아님) — `VALID_STATES` 제거
- [ ] `nx test flow-engine` green · `nx test flows` green · 기존 테스트 회귀 0

### S2b — 터미널 계약 (⏸ **S2와 함께 보류**. S2만으로는 증상이 안 닫힌다)

> S2가 보류이므로 이것도 보류다. **다만 아래 사실관계는 S2 여부와 무관하게 맞고**,
> S3 문서에 남긴다 — 터미널 판정이 유니온과 별개의 두 개짜리 목록으로 박혀 있다는 것.
> S2를 나중에 착수하는 사람이 이 절을 안 보면 게이트가 전부 green인데 증상이 남는다.

**S2의 게이트는 전부 `shouldUpdateState`/`isNodeState` 단언이라, 다 green이어도 실제 증상이
남는다.** 터미널 판정이 유니온과 **별개인 두 개짜리 목록**을 따로 갖고 있기 때문이다:

- `executionReducer.ts:172` — `run-end`를 `COMPLETED`/`ERROR`일 때만 낸다
- `executionReducer.ts:83` — 그 이펙트의 타입 자체가 `state: 'COMPLETED' | 'ERROR'`
- `runSession.ts:58` — `isTerminal`도 같은 둘. `waitForNode`는 여기서만 settle된다(`:106`, `:123`)

→ 유니온을 넓혀도 **SKIPPED 노드는 여전히 `waitForNode`를 깨우지 않는다.** CLI·flow-mcp는
지금과 똑같이 타임아웃까지 매달린다. 브라우저도 같다 — 소켓 경로는 state를 못 넣고, 60초 뒤
폴백 폴링(`EXECUTION_FALLBACK_TIMEOUT_MS`)이 가져온 값도 `getEffectiveState`가 지우므로
**노드가 RUNNING인 채로 영원히 돈다.** 유니온 확장은 이 버그를 옮길 뿐 닫지 않는다.

**결정해야 할 것 (택1, 근거 기록)**:

- (a) **엔진이 SKIPPED를 터미널로 소유** — `run-end`/`NodeOutcome.state`를
  `'COMPLETED' | 'ERROR' | 'SKIPPED'`로 넓히고 `isTerminal`에 추가. flow-mcp의
  `TERMINAL_STATES`가 엔진으로 접힌다. **출력 위치 유니온 확장**이므로 S4의 semver 판단이
  바뀐다(아래)
- (b) **SKIPPED는 터미널 아님으로 명시** — 그럼 "왜 flow-mcp는 완료로 치는가"를 문서로 답해야
  하고, `TERMINAL_STATES`는 소비자에 남는다

**게이트**

- [ ] 위 결정과 근거가 `PLAN.md` §15에 기록됨
- [ ] (a)면: SKIPPED 프레임 하나로 `waitForNode`가 settle되는 테스트
- [ ] (b)면: SKIPPED가 터미널이 아님을 고정하는 테스트 + flow-mcp가 왜 다른지 주석
- [ ] `nx test flow-engine` green

### S3 — 결정 기록 (문서, 모든 갈래 공통)

- [ ] `PLAN.md` §15 신설 — S0의 답, S1 선택지와 근거, S2 배치 근거
- [ ] `libs/engine/src/types.ts:17` 주석 갱신 — "also includes"에서 실제 상태로
      (추가했으면 무엇을 왜 뺐는지 = `''`, 안 했으면 왜 예약어로 남기는지)
- [x] `node-state-model.md` §4 갱신 — 미확인 표시 제거, 판정 결과 반영 (2026-07-30)
- [ ] `node-state-model.md` §2 갱신 — §4의 결론과 어긋나는 서술 없는지 훑기
- [ ] `GUIDE.md`에 state 표 있으면 동기 (있는지 확인 필요)

### S4 — 배포 (⏸ **S2에 종속 → 보류**)

- [ ] `@lemoncloud/flow-engine` minor bump (0.2.0) — **"안 깨진다"고 쓰지 말 것.**
      `NodeState`는 입력 위치만이 아니라 **출력 위치**에도 있다(`NodeData.state`,
      S2b-(a)를 택하면 `NodeOutcome.state`도). 소비자가 _읽는_ 유니온이 넓어지는 건
      exhaustive switch·`Record<NodeState, …>` 맵을 컴파일 에러로 만든다 → 릴리스 노트에
      "타입 레벨 breaking 가능"으로 명기. 이 레포 안 소비자는 전부 `default`가 있어
      컴파일은 통과한다 — 그래서 **에러 대신 오표시**가 난다(리스크 3)
- [ ] 팩된 tarball로 CJS+node10 / CJS+nodenext / ESM+nodenext 3매트릭스 재확인
      (`PLAN.md` §14의 검증 절차 재사용)

### S5 — 소비자 정리 (**flow-mcp 레포, 별 세션**) — ⚠️ **S0 판정으로 뒤집혔다**

원래 이 절은 "엔진이 규칙을 가지면 flow-mcp에서 **지울 것**" 목록이었다. S0이 B로 나오면서
**삭제 항목 대부분이 무효**가 됐다. S2를 안 하므로 "S2 완료 시" 조건이 성립하지 않고,
`SKIPPED` 보정은 죽은 코드가 아니라 **예약된 계약에 대한 방어**다.

| 대상                | 파일               | 지금 판정                                |
| ------------------- | ------------------ | ---------------------------------------- |
| `RANKED_STATES`     | `src/ws-client.ts` | **유지** — S2 보류이므로 조건 미성립     |
| `RANK_AS`           | 같음               | **유지** — 삭제 금지. 아래 참조          |
| `TERMINAL_STATES`   | `src/types.ts:232` | **유지** — 삭제 금지                     |
| `acceptsState` 래퍼 | 같음               | 유지 (S2 착수 시 재검토)                 |
| `rawStateOf`        | 같음               | 유지 — 파싱이 여전히 미지 state를 지운다 |

**왜 지우면 안 되는가.** 서버가 _이 커밋의 이 브랜치에서_ 안 보낸다는 건 다른 레포의 가드를
지울 근거가 못 된다. `NodeStatusType`이 여전히 `SKIPPED`/`WAITING`을 예약하고 있고, 그 기능은
2026-02-28에 리팩터로 빠진 것이지 폐기된 게 아니다. 가드는 싸고, 없을 때의 실패는 조용하다.

**`TERMINAL_STATES` = "엔진에 대응 개념 없음"이라고 적었던 건 별개로 틀렸다.** 엔진에 있다 —
`runSession.ts:58`의 `isTerminal`과 `executionReducer.ts:83`의 `run-end` 이펙트 타입이 정확히
그 개념이다(둘 다 `COMPLETED | ERROR`). 접는 건 S2 착수 시점의 일이다.

**회귀 테스트 2개도 그대로 둔다** (`tests/unit/ws-client.test.ts`의 SKIPPED 터미널 /
SKIPPED 되돌림 방지). 단 **합성 fixture라는 사실을 주석으로 남길 것** — 관측된 트래픽이 아니라
타입 계약에 대한 방어를 고정하는 테스트다.

S5의 실제 산출물은 **삭제가 아니라 주석 한 단락**이다: 왜 이 보정이 존재하고, 언제 지워도
되는지(= `disabled`/조건분기 기능 복귀 여부와 무관하게 서버가 영영 안 보낸다고 확정될 때).

`CLAUDE.md`의 "두 가지 의도적 예외" 서술은 **그대로 유효하다** — SKIPPED 예외가 유지되므로.

---

## What's NOT (경계)

- **`''`를 `NodeState`에 넣지 않는다** — "state 없음"이고 `undefined`가 맞는 표현
- **`core/ingress.ts`의 포트값 머지·downstream 전파는 손대지 않는다** — 별 사안
  (flow-mcp가 의도적으로 미채택한 것, `PLAN.md` 기존 절)
- **서버(`eureka-flows-api`) 수정 없음** — 계약은 이미 8개를 선언한다. 엔진이 짧은 것
- **flow-mcp 코드 수정을 이 플랜에서 하지 않는다** — S5는 별 레포·별 세션
- **`RunNodeStage`(`'' | enter | config | input | process | output | final`)는 범위 밖** —
  state와 다른 축
- **SKIPPED·WAITING의 UI 표현(색·라벨·아이콘)은 만들지 않는다** — 결과를 알고 미루는 것:
  확장 후에도 두 state는 **idle과 구분되지 않게 그려진다**(리스크 3 표). 엔진이 먼저 옳아야
  UI가 그릴 게 생기고, 무엇을 그릴지는 와이어가 실제로 뭘 싣는지(S0) 본 뒤가 맞다.
  후속 티켓으로 등록할 것 — 안 하면 "고쳤는데 화면은 그대로"가 된다

## 리스크

| #   | 리스크                                                                                                                                     | 완화                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 1   | ~~S0이 판정 불가로 끝나면 S2가 죽은 코드~~ → **판정됨. 진짜 리스크는 반대편**: S2를 취소하면 `disabled` 기능 복귀 때 같은 조사를 다시 한다 | S2를 **보류**로 두고 착수 조건 2개를 S0 절에 명시 (기능 복귀 / 실측 확인)                 |
| 2   | ~~`STATE_PRIORITY` 재배정이 저장된 값을 깬다~~ **해소**                                                                                    | 2026-07-30 확인: 출현 1곳(`executionReducer.ts:6`), 직렬화 경로 없음 — 재배정 안전        |
| 3   | **확장이 컴파일을 깨는 게 아니라 UI를 조용히 틀리게 한다**                                                                                 | 아래                                                                                      |
| 4   | S2만 하고 S5를 안 하면 flow-mcp에 죽은 보정이 남는다                                                                                       | S5를 flow-mcp `/tech-debt` 후속으로 등록. `RANK_AS`가 무해하게 no-op이 되므로 급하진 않음 |
| 5   | S2만 하고 S2b를 안 하면 증상(멈춘 노드·hang)이 그대로 남는다                                                                               | S2b를 S2와 한 갈래로 묶음 — 유니온만 넓히고 끝내지 말 것                                  |

**리스크 3 상세 (원래 서술이 뒤집혀 있었다).** "exhaustive switch 소비자가 깨진다 → 먼저
grep해서 확인"은 **거짓 안심**을 준다. 이 레포의 state 소비자는 전부 `default` 폴백을 갖고 있다:

| 위치 (전부 직독 확인, 2026-07-30)             | 미지 state를 만나면                                          |
| --------------------------------------------- | ------------------------------------------------------------ |
| `NodeBlock.tsx:93` `getStatusStyles`          | `default` → IDLE/READY와 같은 테두리                         |
| `Minimap.tsx:15` `STATE_COLORS` (`:268`)      | 키 미스 → `DEFAULT_NODE_COLOR`                               |
| `FlowGraphView.tsx:17` `STATE_FILLS` (`:141`) | 키 미스 → `?? ROLE_FILLS[role]` = 실행 안 한 노드와 같은 색  |
| `ProcessRunButtons.tsx:10` `StatusIcon`       | `default` → 아이콘 없음                                      |
| `MobileStepCard.tsx:161,173`                  | `state === 'COMPLETED' ? … : …` 삼항 → else 가지 = idle 표시 |

(`mobile-editor/components/consts.ts:17`의 `STATE_STYLES`는 **어디서도 import되지 않는
죽은 export**다 — 여기 세지 않는다. 정리는 별건.)

→ grep도 컴파일도 조용하고, **skipped 노드가 idle처럼 보인다.** 확장을 사용자에게 보이게
하려면 UI 작업이 따로 필요하다 — 이 플랜은 그걸 하지 않는다(아래 경계 참조).

## Outcome

(구현 후 채움 — status / commits / verify / scope-diff)
