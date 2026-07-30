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

## ⚠️ 슬라이스 0 — 이걸 먼저 판정해야 나머지가 정해진다

**질문: 와이어가 실제로 `SKIPPED`/`WAITING`을 싣는가?**

eureka-flows-api 런타임에 두 state의 할당이 **없다** (LUT 선언 + README 표가 전부).
노드 실행 state를 계산하는 코드가 그 레포에 없어서 두 레포만으로는 판정이 안 된다.

확인 방법 (아래 중 하나로 결론 나면 충분):

1. 실행기 소유 서비스 찾기 — 노드 실행이 어디서 도는지. `wss-proxy.ts`가 중계하는 발신자
2. 실측 — 조건 분기 있는 플로우를 실행하고 소켓 프레임 원문 덤프. `SKIPPED` 문자열이 오나
3. 사람 확인 — 조건 분기 기능이 출시됐는지, `WAITING`이 설계상 서버발인지 프론트 계산인지

**이건 사람 게이트다** (결정적 도구로 판정 안 됨 — 루프 금지 구역). 답 없이 아래로 내려가지 말 것.

| 답                             | 진행                                                                |
| ------------------------------ | ------------------------------------------------------------------- |
| **A. 싣는다**                  | S1 → S2 → S3 → S4 → S5 전부                                         |
| **B. 안 싣는다 (예약어일 뿐)** | S1 → S3(문서만) → S5. 유니온 확장(S2)은 **하지 않는다** — 죽은 코드 |
| **C. 판정 불가**               | S1만. 나머지는 안개로 남기고 `PLAN.md`에 미해결로 기록              |

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

**게이트**

- [ ] `nx test flow-engine` green
- [ ] 새 테스트: 미지 state가 `next`일 때 / `current`일 때 각각 어떻게 되는지 고정
- [ ] `parseSocketFrame`이 state를 지우는 것과의 상호작용 테스트 — 리듀서가 `undefined`
      state 이벤트를 받았을 때 노드를 건드리지 않는지

### S2 — 유니온·Set·우선순위 확장 (S0 = A일 때만)

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

**번호 재배정 주의**: 값 자체가 어딘가 **저장·직렬화되지 않는지 확인 필요** (상대 순서만
쓰이면 재배정 안전). 확인 안 하고 재배정하지 말 것 — 확인 결과를 슬라이스에 기록.

**게이트**

- [ ] `isNodeState('SKIPPED')` / `('WAITING')` → true
- [ ] `shouldUpdateState('RUNNING','SKIPPED')` → true (더는 버려지지 않음)
- [ ] `shouldUpdateState('SKIPPED','RUNNING')` → false (되돌려지지 않음)
- [ ] `shouldUpdateState('SKIPPED','ERROR')` → true (ERROR는 이김)
- [ ] `shouldUpdateState('COMPLETED','SKIPPED')` → true, 역도 true (동티어 = last-write)
- [ ] `STATE_PRIORITY` 값이 저장/직렬화되지 않음을 확인한 기록
- [ ] `nx test flow-engine` green · 기존 테스트 회귀 0

### S3 — 결정 기록 (문서, 모든 갈래 공통)

- [ ] `PLAN.md` §15 신설 — S0의 답, S1 선택지와 근거, S2 배치 근거
- [ ] `libs/engine/src/types.ts:17` 주석 갱신 — "also includes"에서 실제 상태로
      (추가했으면 무엇을 왜 뺐는지 = `''`, 안 했으면 왜 예약어로 남기는지)
- [ ] `node-state-model.md` §2·§4 갱신 — 미확인 표시 제거, 판정 결과 반영
- [ ] `GUIDE.md`에 state 표 있으면 동기 (있는지 확인 필요)

### S4 — 배포 (S2 했을 때만)

- [ ] `@lemoncloud/flow-engine` minor bump (0.2.0) — 유니온 **확장**이라 기존 소비자
      코드는 안 깨진다. 단 `NodeState`를 exhaustive switch로 받는 소비자는 새 케이스가
      필요해질 수 있다 → 릴리스 노트에 명기
- [ ] 팩된 tarball로 CJS+node10 / CJS+nodenext / ESM+nodenext 3매트릭스 재확인
      (`PLAN.md` §14의 검증 절차 재사용)

### S5 — 소비자 정리 (**flow-mcp 레포, 별 세션**)

엔진이 규칙을 갖게 되면 flow-mcp에서 지울 것:

| 대상                | 파일               | 조건                                               |
| ------------------- | ------------------ | -------------------------------------------------- |
| `RANKED_STATES`     | `src/ws-client.ts` | S2 완료 시                                         |
| `RANK_AS`           | 같음               | S2 완료 시                                         |
| `acceptsState` 래퍼 | 같음               | `shouldUpdateState` 직접 호출로 축소               |
| `rawStateOf`        | 같음               | 파싱이 state를 더는 안 지울 때만                   |
| `TERMINAL_STATES`   | `src/types.ts:232` | **남긴다** — 완료 판정용이고 엔진에 대응 개념 없음 |

**회귀 테스트 2개는 지우지 않는다** (`tests/unit/ws-client.test.ts`의 SKIPPED 터미널 /
SKIPPED 되돌림 방지). 보정이 사라지면 그 테스트가 **엔진 규칙을 검증하는 테스트**가 된다.

`CLAUDE.md`의 "두 가지 의도적 예외" 서술도 갱신 — SKIPPED 예외가 없어진다.

---

## What's NOT (경계)

- **`''`를 `NodeState`에 넣지 않는다** — "state 없음"이고 `undefined`가 맞는 표현
- **`core/ingress.ts`의 포트값 머지·downstream 전파는 손대지 않는다** — 별 사안
  (flow-mcp가 의도적으로 미채택한 것, `PLAN.md` 기존 절)
- **서버(`eureka-flows-api`) 수정 없음** — 계약은 이미 8개를 선언한다. 엔진이 짧은 것
- **flow-mcp 코드 수정을 이 플랜에서 하지 않는다** — S5는 별 레포·별 세션
- **`RunNodeStage`(`'' | enter | config | input | process | output | final`)는 범위 밖** —
  state와 다른 축

## 리스크

| #   | 리스크                                                       | 완화                                                                                      |
| --- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 1   | S0이 판정 불가로 끝나면 S2가 죽은 코드가 된다                | S0을 사람 게이트로 두고, C 갈래에서 S2를 명시적으로 중단                                  |
| 2   | `STATE_PRIORITY` 번호 재배정이 어딘가에 저장돼 있으면 깨진다 | S2 게이트에 확인 항목으로 박음 — 확인 전 재배정 금지                                      |
| 3   | `NodeState` 확장이 exhaustive switch 소비자를 깨울 수 있다   | S4 릴리스 노트 + minor bump. 브라우저·CLI를 먼저 grep                                     |
| 4   | S2만 하고 S5를 안 하면 flow-mcp에 죽은 보정이 남는다         | S5를 flow-mcp `/tech-debt` 후속으로 등록. `RANK_AS`가 무해하게 no-op이 되므로 급하진 않음 |

## Outcome

(구현 후 채움 — status / commits / verify / scope-diff)
